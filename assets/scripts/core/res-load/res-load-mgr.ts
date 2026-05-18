import { Asset, AssetManager, Sprite, SpriteAtlas, SpriteFrame } from "cc";
import { gcoreEvent, GCoreEvent } from "../../event/gcore-event";

type Bundle = AssetManager.Bundle;

/** Bundle 资源生命周期策略 */
export enum EResBundlePolicy {
    /** 随 Bundle 加载，常驻内存直到调用 releaseBundle 释放 */
    Core,
    /** 业务引用归零后保持在共享 LRU 缓存中 */
    Hot,
    /** 业务引用归零后立即释放 */
    Normal,
}

/** ResLoadMgr 初始化选项 */
export interface ResLoadMgrInitOptions {
    /** 共享热更新资源缓存容量（按资源数量计） */
    hotCacheCapacity?: number;
}

/** Bundle 策略信息 */
interface BundlePolicyInfo {
    policy: EResBundlePolicy;  // 策略类型
}

/** 资源引用信息 */
interface ResRefInfo<T extends Asset = Asset> {
    asset: T;                   // 资源实例
    refs: number;               // 业务引用计数
    packName: string;           // 包名
    resPath: string;             // 资源路径
    policy: EResBundlePolicy;    // 所属策略
    cached: boolean;             // refs 为 0 时管理器是否持有保留引用
    managedRef: boolean;         // 是否拥有非 Core 管理器的 addRef
}

/** 资源加载、引用计数与 Bundle 策略管理器 */
export class ResLoadMgr {

    /** 已加载的资源包集合 */
    private _loadedPackList: Map<string, Bundle> = new Map();

    /** Bundle 策略配置映射 */
    private _bundlePolicyMap: Map<string, BundlePolicyInfo> = new Map();

    /** 已加载资源的引用信息 */
    private _resRefMap: Map<string, ResRefInfo> = new Map();

    /** 正在加载的资源任务，用于合并相同资源的加载请求 */
    private _loadingResMap: Map<string, Promise<Asset>> = new Map();

    /** 正在加载的 Bundle 任务 */
    private _loadingBundleMap: Map<string, Promise<Bundle>> = new Map();

    /** 共享热更新资源 LRU 队列，Map 的插入顺序即为 LRU 顺序 */
    private _hotLruMap: Map<string, true> = new Map();

    /** 共享热更新缓存容量 */
    private _hotCacheCapacity = 0;

    /** Core Bundle 固定资源，按资源 uuid 索引避免重复 addRef */
    private _coreAssetMap: Map<string, Map<string, Asset>> = new Map();

    /****************  生命周期方法  ****************/

    /** 初始化管理器
     * @param options 初始化选项
     */
    public init(options: ResLoadMgrInitOptions = {}): void {
        this.setHotCacheCapacity(options.hotCacheCapacity ?? this._hotCacheCapacity);
    }

    /****************  Bundle 策略配置  ****************/

    /** 设置 Bundle 的策略
     * @param packName 包名
     * @param policy 策略类型
     */
    public setBundlePolicy(packName: string, policy: EResBundlePolicy): void {

        const oldPolicy = this.getBundlePolicy(packName);
        this._bundlePolicyMap.set(packName, { policy });

        // 从 Hot 切换到其他策略时清除缓存
        if (oldPolicy === EResBundlePolicy.Hot && policy !== EResBundlePolicy.Hot) {
            this.clearOneHotCache(packName);
        }

        // 将策略应用到已加载的资源
        this.applyBundlePolicyToLoadedResources(packName, policy);

    }

    /** 获取 Bundle 的当前策略
     * @param packName 包名
     * @returns 策略类型
     */
    public getBundlePolicy(packName: string): EResBundlePolicy {
        return this.getBundlePolicyInfo(packName).policy;
    }

    /** 设置所有热更新 Bundle 共享的 LRU 缓存容量
     * @param lruCapacity 缓存容量
     */
    public setHotCacheCapacity(lruCapacity: number): void {
        this._hotCacheCapacity = Math.max(0, lruCapacity);
        this.trimHotCache();
    }

    /** 获取热更新缓存容量
     * @returns 缓存容量值
     */
    public getHotCacheCapacity(): number {
        return this._hotCacheCapacity;
    }

    /****************  Bundle 加载与管理  ****************/

    /** 加载资源包
     * @param packName 包名
     * @param policy 策略类型（可选）
     * @returns 资源包实例
     */
    public async loadBundle(packName: string, policy?: EResBundlePolicy): Promise<Bundle> {

        // 设置策略
        if (policy !== undefined) {
            this.setBundlePolicy(packName, policy);
        }

        // 命中缓存，直接返回
        const loadedBundle = this._loadedPackList.get(packName);
        if (loadedBundle) {
            gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.BUNDLE_LOAD_COMPLETE, packName);
            // Core 策略需要预加载所有资源
            if (this.getBundlePolicy(packName) === EResBundlePolicy.Core) {
                await this.loadCoreBundleAssets(packName, loadedBundle);
            }
            return loadedBundle;
        }

        // 复用正在进行的加载任务
        const loadingBundle = this._loadingBundleMap.get(packName);
        if (loadingBundle) {
            return loadingBundle;
        }

        // 创建新的加载任务
        const task = new Promise<Bundle>((resolve, reject) => {
            AssetManager.instance.loadBundle(packName, (err, bundle) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!bundle) {
                    reject(new Error(`资源包加载失败。packName:${packName}`));
                    return;
                }

                this._loadedPackList.set(packName, bundle);
                gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.BUNDLE_LOAD_COMPLETE, packName);
                resolve(bundle);
            });
        });

        this._loadingBundleMap.set(packName, task);

        try {
            const bundle = await task;
            // Core 策略需要预加载所有资源
            if (this.getBundlePolicy(packName) === EResBundlePolicy.Core) {
                await this.loadCoreBundleAssets(packName, bundle);
            }
            return bundle;
        } finally {
            this._loadingBundleMap.delete(packName);
        }

    }

    /** 释放 Bundle 的所有资源并从 AssetManager 中移除
     * 这是 Core Bundle 的显式释放出口
     * @param packName 包名
     * @returns 是否成功
     */
    public releaseBundle(packName: string): boolean {

        const bundle = this._loadedPackList.get(packName);
        if (!bundle) {
            console.warn(`无法释放未加载的 Bundle。packName:${packName}`);
            return false;
        }

        // 释放所有相关资源
        this.releasePackRes(packName);
        this.releaseCorePinnedAssets(packName);
        this._bundlePolicyMap.delete(packName);
        this._loadedPackList.delete(packName);
        AssetManager.instance.removeBundle(bundle);

        return true;

    }

    /****************  资源加载与引用计数  ****************/

    /** 加载资源并为调用方保留一个业务引用
     * 每次成功调用都必须与 releaseRes 配对
     * @param resPath 资源路径
     * @param packName 包名
     * @typeParam T 资源类型
     * @returns 资源实例
     */
    public async loadRes<T extends Asset>(resPath: string, packName: string): Promise<T> {

        const key = this.getResKey(packName, resPath);
        const loadedInfo = this._resRefMap.get(key);
        if (loadedInfo) {
            // 命中缓存，获取资源
            this.acquireLoadedRes(loadedInfo);
            gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.RES_LOAD_COMPLETE, resPath, packName);
            return loadedInfo.asset as T;
        }

        // 创建或复用加载任务
        const asset = await this.getOrCreateLoadTask<T>(resPath, packName);
        const info = this._resRefMap.get(key);

        if (info) {
            this.acquireLoadedRes(info);
            gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.RES_LOAD_COMPLETE, resPath, packName);
            return info.asset as T;
        }

        // 检查是否已由 Core 策略固定
        const policy = this.getBundlePolicy(packName);
        const corePinned = policy === EResBundlePolicy.Core && this.isCoreAssetPinned(packName, asset);

        // 非固定资源需要增加引用
        if (!corePinned) {
            asset.addRef();
        }

        // 记录资源引用信息
        this._resRefMap.set(key, {
            asset,
            refs: 1,
            packName,
            resPath,
            policy,
            cached: corePinned,
            managedRef: !corePinned,
        });

        gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.RES_LOAD_COMPLETE, resPath, packName);

        return asset as T;
    }

    /** 为已加载的资源增加一个业务引用
     * @param resPath 资源路径
     * @param packName 包名
     * @returns 是否成功
     */
    public retainRes(resPath: string, packName: string): boolean {

        const key = this.getResKey(packName, resPath);
        const info = this._resRefMap.get(key);
        if (!info) {
            console.warn(`无法保留未加载的资源。packName:${packName} resPath:${resPath}`);
            return false;
        }

        this.acquireLoadedRes(info);
        return true;

    }

    /** 释放资源的一个业务引用
     * @param resPath 资源路径
     * @param packName 包名
     * @returns 是否成功
     */
    public releaseRes(resPath: string, packName: string): boolean {

        const key = this.getResKey(packName, resPath);
        const info = this._resRefMap.get(key);
        if (!info) {
            console.warn(`无法释放未加载的资源。packName:${packName} resPath:${resPath}`);
            return false;
        }

        if (info.refs <= 0) {
            console.warn(`资源没有业务引用。packName:${packName} resPath:${resPath}`);
            return false;
        }

        // Core 策略只减少计数
        if (info.policy === EResBundlePolicy.Core) {
            info.refs--;
            if (info.refs <= 0 && info.managedRef) {
                info.asset.decRef();
                this._resRefMap.delete(key);
            }
            return true;
        }

        // Hot 策略最后一次引用转为缓存
        if (info.policy === EResBundlePolicy.Hot && info.refs === 1) {
            info.refs = 0;
            info.cached = true;
            this.addHotCache(info);
            return true;
        }

        // Normal 策略直接释放
        info.refs--;
        info.asset.decRef();

        if (info.refs <= 0) {
            this._resRefMap.delete(key);
        }

        return true;

    }

    /** 释放指定包的所有资源
     * @param packName 包名
     */
    public releasePackRes(packName: string): void {

        const releaseList = Array.from(this._resRefMap.values()).filter((info) => info.packName === packName);
        for (const info of releaseList) {
            this.releaseResInfo(info);
        }

        // 移除热缓存中属于该包的资源键
        this.removeHotCacheByBundle(packName);

    }

    /** 清除零引用的热更新资源
     * 传入 packName 则只清除该包的缓存，不传则清除所有
     * @param packName 包名（可选）
     */
    public clearHotCache(packName?: string): void {

        if (packName) {
            this.clearOneHotCache(packName);
            return;
        }

        // 清除所有热缓存
        for (const key of Array.from(this._hotLruMap.keys())) {
            this.releaseHotCacheKey(key);
        }

        this._hotLruMap.clear();

    }

    /** 获取资源被此管理器持有的业务引用计数
     * @param resPath 资源路径
     * @param packName 包名
     * @returns 引用计数
     */
    public getResRefCount(resPath: string, packName: string): number {

        const key = this.getResKey(packName, resPath);
        return this._resRefMap.get(key)?.refs ?? 0;

    }

    /** 获取共享热更新缓存大小
     * @returns 缓存中的资源数量
     */
    public getHotCacheSize(): number {
        return this._hotLruMap.size;
    }

    /** 获取指定包在热缓存中的资源数量
     * @param packName 包名
     * @returns 缓存中属于该包的资源数量
     */
    public getHotCacheSizeByBundle(packName: string): number {

        let count = 0;
        for (const key of this._hotLruMap.keys()) {
            const info = this._resRefMap.get(key);
            if (info?.packName === packName) {
                count++;
            }
        }

        return count;

    }

    /****************  Sprite 设置便捷方法  ****************/

    /** 设置 Sprite 的 SpriteFrame
     * @param resPath 资源路径
     * @param packName 包名
     * @param sprite 目标 Sprite 组件
     * @returns 是否成功
     */
    public async setSprite(resPath: string, packName: string, sprite: Sprite): Promise<boolean> {

        // 检查 Sprite 有效性
        if (!sprite.isValid) {
            console.error("Sprite 无效。");
            return false;
        }

        const asset = await this.loadRes<SpriteFrame>(resPath, packName);

        // 类型校验
        if (!(asset instanceof SpriteFrame)) {
            this.releaseRes(resPath, packName);
            throw new Error(`资源类型错误，期望 SpriteFrame。packName:${packName} resPath:${resPath}`);
        }

        // 再次检查 Sprite 有效性
        if (!sprite.isValid) {
            this.releaseRes(resPath, packName);
            console.warn("Sprite 无效。");
            return false;
        }

        sprite.spriteFrame = asset;
        return true;

    }

    /** 从图集中设置 Sprite 的 SpriteFrame
     * @param resPath 图集资源路径
     * @param spriteFrameName 图集中的帧名称
     * @param packName 包名
     * @param sprite 目标 Sprite 组件
     * @returns 是否成功
     */
    public async setSpriteFormAtlas(resPath: string, spriteFrameName: string, packName: string, sprite: Sprite): Promise<boolean> {

        const asset = await this.loadRes<SpriteAtlas>(resPath, packName);

        // 类型校验
        if (!(asset instanceof SpriteAtlas)) {
            this.releaseRes(resPath, packName);
            throw new Error(`资源类型错误，期望 SpriteAtlas。packName:${packName} resPath:${resPath}`);
        }

        // 检查 Sprite 有效性
        if (!sprite.isValid) {
            this.releaseRes(resPath, packName);
            console.warn("Sprite 无效。");
            return false;
        }

        // 获取图集中的帧
        const sf = asset.getSpriteFrame(spriteFrameName);
        if (!sf) {
            this.releaseRes(resPath, packName);
            throw new Error(`SpriteFrame 不存在。packName:${packName} resPath:${resPath} name:${spriteFrameName}`);
        }

        sprite.spriteFrame = sf;
        return true;

    }

    /****************  私有辅助方法  ****************/

    /** 生成资源唯一标识键
     * @param packName 包名
     * @param resPath 资源路径
     * @returns 格式为 "包名:资源路径" 的唯一键
     */
    private getResKey(packName: string, resPath: string): string {
        return `${packName}:${resPath}`;
    }

    /** 获取 Bundle 策略信息（不存在则返回默认 Normal 策略）
     * @param packName 包名
     * @returns 策略信息
     */
    private getBundlePolicyInfo(packName: string): BundlePolicyInfo {
        return this._bundlePolicyMap.get(packName) ?? {
            policy: EResBundlePolicy.Normal,
        };
    }

    /** 获取已加载资源的引用
     * @param info 资源引用信息
     */
    private acquireLoadedRes(info: ResRefInfo): void {

        // Core 策略只增加计数
        if (info.policy === EResBundlePolicy.Core) {
            info.refs++;
            return;
        }

        // Hot 策略从缓存恢复
        if (info.policy === EResBundlePolicy.Hot && info.cached && info.refs === 0) {
            info.refs = 1;
            info.cached = false;
            this._hotLruMap.delete(this.getResKey(info.packName, info.resPath));
            return;
        }

        // 增加引用计数和资源引用
        info.refs++;
        info.asset.addRef();

    }

    /** 获取或创建资源加载任务（用于合并相同请求）
     * @param resPath 资源路径
     * @param packName 包名
     * @typeParam T 资源类型
     * @returns 资源实例
     */
    private async getOrCreateLoadTask<T extends Asset>(resPath: string, packName: string): Promise<T> {

        const key = this.getResKey(packName, resPath);

        // 命中正在进行的加载任务，复用 Promise
        const loadingTask = this._loadingResMap.get(key);
        if (loadingTask) {
            return loadingTask as Promise<T>;
        }

        // 获取资源包
        const bundle = this._loadedPackList.get(packName);
        if (!bundle) {
            throw new Error(`资源包不存在。packName:${packName}`);
        }

        // 创建新的加载任务
        const task = new Promise<Asset>((resolve, reject) => {
            bundle.load(resPath, (err, asset) => {
                if (err) {
                    console.error(`资源不存在。packName:${packName} resPath:${resPath} error:${err.message}`);
                    reject(err);
                    return;
                }

                if (!asset) {
                    reject(new Error(`资源加载失败。packName:${packName} resPath:${resPath}`));
                    return;
                }

                resolve(asset);
            });
        });

        // 缓存任务
        this._loadingResMap.set(key, task);

        try {
            return await task as T;
        } finally {
            // 加载完成后移除缓存
            this._loadingResMap.delete(key);
        }

    }

    /** 加载 Core Bundle 的所有资源并固定引用
     * @param packName 包名
     * @param bundle 资源包实例
     */
    private async loadCoreBundleAssets(packName: string, bundle: Bundle): Promise<void> {

        // 已加载过则跳过
        if (this._coreAssetMap.has(packName)) {
            return;
        }

        // 加载目录下所有资源
        const assets = await new Promise<Asset[]>((resolve, reject) => {
            bundle.loadDir("", (err, data: Asset[]) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(data ?? []);
            });
        });

        // 固定每个资源（按 uuid 去重）
        const pinnedMap = new Map<string, Asset>();
        for (const asset of assets) {
            if (pinnedMap.has(asset.uuid)) {
                continue;
            }

            asset.addRef();
            pinnedMap.set(asset.uuid, asset);
        }

        this._coreAssetMap.set(packName, pinnedMap);

    }

    /** 检查资源是否已被 Core 策略固定
     * @param packName 包名
     * @param asset 资源实例
     * @returns 是否固定
     */
    private isCoreAssetPinned(packName: string, asset: Asset): boolean {
        return this._coreAssetMap.get(packName)?.has(asset.uuid) ?? false;
    }

    /** 添加资源到热更新缓存
     * @param info 资源引用信息
     */
    private addHotCache(info: ResRefInfo): void {

        const key = this.getResKey(info.packName, info.resPath);
        // 移到队列末尾（最近使用）
        this._hotLruMap.delete(key);
        this._hotLruMap.set(key, true);
        // 裁剪超出容量
        this.trimHotCache();

    }

    /** 裁剪热更新缓存超出容量的部分 */
    private trimHotCache(): void {

        // 从队列头部（最久未使用）开始淘汰
        while (this._hotLruMap.size > this._hotCacheCapacity) {
            const evictKey = this._hotLruMap.keys().next().value as string | undefined;
            if (!evictKey) {
                break;
            }

            this.releaseHotCacheKey(evictKey);
        }

    }

    /** 清除单个包的热更新缓存
     * @param packName 包名
     */
    private clearOneHotCache(packName: string): void {

        for (const key of Array.from(this._hotLruMap.keys())) {
            const info = this._resRefMap.get(key);
            if (info?.packName === packName) {
                this.releaseHotCacheKey(key);
            }
        }

    }

    /** 从热缓存中移除指定包的所有键
     * @param packName 包名
     */
    private removeHotCacheByBundle(packName: string): void {

        for (const key of Array.from(this._hotLruMap.keys())) {
            const info = this._resRefMap.get(key);
            // 移除资源已释放的键，或属于目标包的键
            if (!info || info.packName === packName) {
                this._hotLruMap.delete(key);
            }
        }

    }

    /** 释放热缓存中指定键的资源
     * @param key 资源键
     */
    private releaseHotCacheKey(key: string): void {

        this._hotLruMap.delete(key);
        const info = this._resRefMap.get(key);
        // 跳过仍有引用的资源
        if (!info || info.refs > 0) {
            return;
        }

        // 释放保留引用
        if (info.cached || info.managedRef) {
            info.asset.decRef();
        }

        this._resRefMap.delete(key);

    }

    /** 释放资源引用信息
     * @param info 资源引用信息
     */
    private releaseResInfo(info: ResRefInfo): void {

        const key = this.getResKey(info.packName, info.resPath);
        this._hotLruMap.delete(key);

        // Core 策略释放托管引用
        if (info.policy === EResBundlePolicy.Core) {
            if (info.managedRef) {
                for (let i = 0; i < info.refs; i++) {
                    info.asset.decRef();
                }
            }
            this._resRefMap.delete(key);
            return;
        }

        // 计算实际引用计数并释放
        const refCount = info.cached && info.refs === 0 ? 1 : info.refs;
        for (let i = 0; i < refCount; i++) {
            info.asset.decRef();
        }

        this._resRefMap.delete(key);

    }

    /** 释放 Core Bundle 固定的资源引用
     * @param packName 包名
     */
    private releaseCorePinnedAssets(packName: string): void {

        const pinnedMap = this._coreAssetMap.get(packName);
        if (!pinnedMap) {
            return;
        }

        // 释放所有固定资源的引用
        for (const asset of pinnedMap.values()) {
            asset.decRef();
        }

        this._coreAssetMap.delete(packName);

    }

    /** 将策略应用到已加载的资源
     * @param packName 包名
     * @param policy 策略类型
     */
    private applyBundlePolicyToLoadedResources(packName: string, policy: EResBundlePolicy): void {

        for (const info of this._resRefMap.values()) {
            if (info.packName === packName) {
                info.policy = policy;
            }
        }

    }

}
