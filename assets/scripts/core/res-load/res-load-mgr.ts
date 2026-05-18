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
    policy: EResBundlePolicy;
}

/** 资源引用信息 */
interface ResRefInfo<T extends Asset = Asset> {
    asset: T;
    refs: number;
    packName: string;
    resPath: string;
    policy: EResBundlePolicy;
    cached: boolean;
    managedRef: boolean;
}

/** 正在加载的资源信息 */
interface LoadingResInfo {
    promise: Promise<Asset>;
    refs: number;
}

/** 资源加载、引用计数与 Bundle 策略管理器 */
export class ResLoadMgr {

    /** 已加载的资源包列表 */
    private _loadedPackList: Map<string, Bundle> = new Map();
    /** Bundle 策略映射表 */
    private _bundlePolicyMap: Map<string, BundlePolicyInfo> = new Map();
    /** 资源引用信息映射表 */
    private _resRefMap: Map<string, ResRefInfo> = new Map();
    /** 正在加载的资源信息映射表 */
    private _loadingResMap: Map<string, LoadingResInfo> = new Map();
    /** 正在加载的 Bundle 映射表 */
    private _loadingBundleMap: Map<string, Promise<Bundle>> = new Map();
    /** 热更新资源 LRU 缓存映射表 */
    private _hotLruMap: Map<string, true> = new Map();
    /** 热缓存容量 */
    private _hotCacheCapacity = 0;
    /** Core Bundle 固定资源映射表 */
    private _coreAssetMap: Map<string, Map<string, Asset>> = new Map();
    /** 反向索引：asset.uuid → resKey，供 releaseAssets O(1) 查找。在 _resRefMap 写入/删除时同步维护 */
    private _uuidToKeyMap: Map<string, string> = new Map();

    /****************  生命周期方法  ****************/

    /** 初始化管理器
     * @param options 初始化选项
     */
    public init(options: ResLoadMgrInitOptions = {}): void {
        this.setHotCacheCapacity(options.hotCacheCapacity ?? this._hotCacheCapacity);
    }

    /****************  Bundle 策略配置  ****************/

    /** 设置 Bundle 资源生命周期策略
     * @param packName 包名
     * @param policy 策略类型
     */
    public setBundlePolicy(packName: string, policy: EResBundlePolicy): void {
        const oldPolicy = this.getBundlePolicy(packName);
        this._bundlePolicyMap.set(packName, { policy });

        if (oldPolicy === EResBundlePolicy.Hot && policy !== EResBundlePolicy.Hot) {
            this.clearOneHotCache(packName);
        }

        /**
         * FIX: 策略切换时同步迁移已加载资源的 managedRef 状态，避免
         * 新策略下引用计数语义与实际 addRef 次数不一致。
         *
         * 迁移规则：
         *   旧 Core → 新非 Core：原先无 managedRef，现在需要为每个 refs > 0
         *     的资源补 addRef，并置 managedRef = true。
         *   旧非 Core → 新 Core：原先有 managedRef，转交给 Core 固定机制后
         *     不再由 managedRef 跟踪，置 managedRef = false，多余 addRef 由
         *     Core pinnedMap 接管（此处只做标记，实际 pin 在 loadCoreBundleAssets）。
         *   其余组合（Normal ↔ Hot）只更新 policy 字段，引用计数结构相同。
         */
        for (const info of this._resRefMap.values()) {
            if (info.packName !== packName) continue;

            const fromCore = oldPolicy === EResBundlePolicy.Core;
            const toCore = policy === EResBundlePolicy.Core;

            if (fromCore && !toCore && !info.managedRef && info.refs > 0) {
                // Core → 非 Core：补充业务引用持有的 addRef
                for (let i = 0; i < info.refs; i++) {
                    info.asset.addRef();
                }
                info.managedRef = true;
            } else if (!fromCore && toCore && info.managedRef) {
                // 非 Core → Core：managedRef 标记移交 Core 固定机制
                info.managedRef = false;
            }

            info.policy = policy;
        }
    }

    /** 获取 Bundle 资源生命周期策略
     * @param packName 包名
     * @returns 策略类型
     */
    public getBundlePolicy(packName: string): EResBundlePolicy {
        return this.getBundlePolicyInfo(packName).policy;
    }

    /** 设置热缓存容量
     * @param lruCapacity 缓存容量
     */
    public setHotCacheCapacity(lruCapacity: number): void {
        this._hotCacheCapacity = Math.max(0, lruCapacity);
        this.trimHotCache();
    }

    /** 获取热缓存容量
     * @returns 当前缓存容量
     */
    public getHotCacheCapacity(): number {
        return this._hotCacheCapacity;
    }

    /****************  Bundle 加载与管理  ****************/

    /** 加载资源包
     * @param packName 包名
     * @param policy 资源生命周期策略（可选）
     * @returns 加载的 Bundle
     */
    public async loadBundle(packName: string, policy?: EResBundlePolicy): Promise<Bundle> {
        if (policy !== undefined) {
            this.setBundlePolicy(packName, policy);
        }

        const loadedBundle = this._loadedPackList.get(packName);
        if (loadedBundle) {
            gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.BUNDLE_LOAD_COMPLETE, packName);
            if (this.getBundlePolicy(packName) === EResBundlePolicy.Core) {
                await this.loadCoreBundleAssets(packName, loadedBundle);
            }
            return loadedBundle;
        }

        const loadingBundle = this._loadingBundleMap.get(packName);
        if (loadingBundle) {
            return loadingBundle;
        }

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
            /**
             * FIX: 先将 Bundle 加入 loadedPackList，再 await loadCoreBundleAssets，
             * 两步之间存在窗口。原代码在此窗口内调用 loadRes 会绕过 Core 固定机制。
             * 修复方案：将 Core 资源预加载移至 loadedPackList.set 之前完成，
             * 但 loadDir 依赖 bundle 实例，故改为：在 loadCoreBundleAssets 内部
             * 对每个加载进来的资源立即检查 _resRefMap，若已存在则标记 corePinned。
             * （见 loadCoreBundleAssets 内部修复注释）
             */
            if (this.getBundlePolicy(packName) === EResBundlePolicy.Core) {
                await this.loadCoreBundleAssets(packName, bundle);
            }
            return bundle;
        } finally {
            this._loadingBundleMap.delete(packName);
        }
    }

    /** 释放资源包
     * @param packName 包名
     * @returns 是否成功释放
     */
    public releaseBundle(packName: string): boolean {
        const bundle = this._loadedPackList.get(packName);
        if (!bundle) {
            console.warn(`无法释放未加载的 Bundle。packName:${packName}`);
            return false;
        }

        this.releasePackRes(packName);
        this.releaseCorePinnedAssets(packName);
        this._bundlePolicyMap.delete(packName);
        this._loadedPackList.delete(packName);
        AssetManager.instance.removeBundle(bundle);

        return true;
    }

    /****************  资源加载与引用计数  ****************/

    /** 加载资源（带引用计数）
     * @typeParam T 资源类型
     * @param resPath 资源路径
     * @param packName 包名
     * @returns 加载的资源
     */
    public async loadRes<T extends Asset>(resPath: string, packName: string): Promise<T> {
        const key = this.getResKey(packName, resPath);
        const loadedInfo = this._resRefMap.get(key);
        if (loadedInfo) {
            this.acquireLoadedRes(loadedInfo);
            gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.RES_LOAD_COMPLETE, resPath, packName);
            return loadedInfo.asset as T;
        }

        const loadingInfo = this.getOrCreateLoadTask(resPath, packName);
        loadingInfo.refs++;

        const asset = await loadingInfo.promise as T;

        /**
         * FIX: 竞态条件修复。
         *
         * 场景：调用方 A 和 B 并发 loadRes 同一资源。A 先到达 await 下方，
         * 执行 _resRefMap.set 写入记录；B 随后到达，原代码直接 return info.asset，
         * 跳过了 addRef，导致 B 持有"幽灵引用"，后续 releaseRes 引用计数失衡。
         *
         * 修复：await 结束后再次检查 _resRefMap。
         *   - 若已存在记录（另一个并发调用已写入），走 acquireLoadedRes 补齐引用后返回。
         *   - 若不存在，由本次调用负责写入记录并完成 addRef。
         */
        const existingInfo = this._resRefMap.get(key);
        if (existingInfo) {
            // 将本次累计的 refs 额外补进去（loadingInfo.refs 已包含本次的 1）
            // acquireLoadedRes 处理一次，其余 refs-1 次手动补充
            this.acquireLoadedRes(existingInfo);
            const extraRefs = loadingInfo.refs - 1;
            if (extraRefs > 0 && existingInfo.policy !== EResBundlePolicy.Core) {
                for (let i = 0; i < extraRefs; i++) {
                    existingInfo.refs++;
                    existingInfo.asset.addRef();
                }
            } else if (extraRefs > 0) {
                existingInfo.refs += extraRefs;
            }
            this._loadingResMap.delete(key);
            gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.RES_LOAD_COMPLETE, resPath, packName);
            return existingInfo.asset as T;
        }

        const policy = this.getBundlePolicy(packName);
        const corePinned = policy === EResBundlePolicy.Core && this.isCoreAssetPinned(packName, asset);
        const refs = loadingInfo.refs;

        if (!corePinned) {
            for (let i = 0; i < refs; i++) {
                asset.addRef();
            }
        }

        const newInfo: ResRefInfo = {
            asset,
            refs,
            packName,
            resPath,
            policy,
            cached: corePinned,
            managedRef: !corePinned,
        };

        this._resRefMap.set(key, newInfo);
        // FIX: 同步写入 uuid 反向索引
        this._uuidToKeyMap.set(asset.uuid, key);

        this._loadingResMap.delete(key);
        gcoreEvent.emit(GCoreEvent.RES_LOAD_EVENT.RES_LOAD_COMPLETE, resPath, packName);

        return asset as T;
    }

    /** 增加资源引用计数
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

    /** 释放资源引用
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

        if (info.policy === EResBundlePolicy.Core) {
            info.refs--;
            if (info.refs <= 0 && info.managedRef) {
                info.asset.decRef();
                this.deleteResInfo(key);
            }
            return true;
        }

        if (info.policy === EResBundlePolicy.Hot && info.refs === 1) {
            info.refs = 0;
            info.cached = true;
            this.addHotCache(info);
            return true;
        }

        info.refs--;
        info.asset.decRef();

        if (info.refs <= 0) {
            this.deleteResInfo(key);
        }

        return true;
    }

    /** 通过资源实例释放资源
     * @param asset 资源实例
     * @returns 是否成功
     */
    public releaseAssets(asset: Asset): boolean {
        if (!asset) {
            console.warn("无法释放空资源。");
            return false;
        }

        /**
         * FIX: 使用 uuid 反向索引 O(1) 查找，替换原先 O(n) 遍历。
         */
        const info = this.findResInfoByAsset(asset);
        if (!info) {
            console.warn(`无法释放未由 ResLoadMgr 管理的资源。uuid:${asset.uuid} name:${asset.name}`);
            return false;
        }

        return this.releaseRes(info.resPath, info.packName);
    }

    /** 释放包内所有资源
     * @param packName 包名
     */
    public releasePackRes(packName: string): void {
        const releaseList = Array.from(this._resRefMap.values()).filter((info) => info.packName === packName);
        for (const info of releaseList) {
            this.releaseResInfo(info);
        }
        this.removeHotCacheByBundle(packName);
    }

    /** 清空热缓存
     * @param packName 包名（可选，不传则清空所有热缓存）
     */
    public clearHotCache(packName?: string): void {
        if (packName) {
            this.clearOneHotCache(packName);
            return;
        }

        for (const key of Array.from(this._hotLruMap.keys())) {
            this.releaseHotCacheKey(key);
        }
        this._hotLruMap.clear();
    }

    /** 获取资源引用计数
     * @param resPath 资源路径
     * @param packName 包名
     * @returns 引用计数
     */
    public getResRefCount(resPath: string, packName: string): number {
        const key = this.getResKey(packName, resPath);
        return this._resRefMap.get(key)?.refs ?? 0;
    }

    /** 获取热缓存大小
     * @returns 热缓存条目数量
     */
    public getHotCacheSize(): number {
        return this._hotLruMap.size;
    }

    /** 获取指定包的热缓存大小
     * @param packName 包名
     * @returns 热缓存条目数量
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
        if (!sprite.isValid) {
            console.error("Sprite 无效。");
            return false;
        }

        const asset = await this.loadRes<SpriteFrame>(resPath, packName);

        if (!(asset instanceof SpriteFrame)) {
            this.releaseRes(resPath, packName);
            throw new Error(`资源类型错误，期望 SpriteFrame。packName:${packName} resPath:${resPath}`);
        }

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
     * @param spriteFrameName 图集中的 SpriteFrame 名称
     * @param packName 包名
     * @param sprite 目标 Sprite 组件
     * @returns 是否成功
     */
    public async setSpriteFormAtlas(resPath: string, spriteFrameName: string, packName: string, sprite: Sprite): Promise<boolean> {
        const asset = await this.loadRes<SpriteAtlas>(resPath, packName);

        if (!(asset instanceof SpriteAtlas)) {
            this.releaseRes(resPath, packName);
            throw new Error(`资源类型错误，期望 SpriteAtlas。packName:${packName} resPath:${resPath}`);
        }

        if (!sprite.isValid) {
            this.releaseRes(resPath, packName);
            console.warn("Sprite 无效。");
            return false;
        }

        const sf = asset.getSpriteFrame(spriteFrameName);
        if (!sf) {
            this.releaseRes(resPath, packName);
            throw new Error(`SpriteFrame 不存在。packName:${packName} resPath:${resPath} name:${spriteFrameName}`);
        }

        sprite.spriteFrame = sf;
        return true;
    }

    /****************  私有辅助方法  ****************/

    /** 生成资源键
     * @param packName 包名
     * @param resPath 资源路径
     * @returns 组合键
     */
    private getResKey(packName: string, resPath: string): string {
        return `${packName}:${resPath}`;
    }

    /** 通过资源实例查找资源引用信息（优先走 uuid 反向索引 O(1) 查找，未命中时回退遍历）
     * @param asset 资源实例
     * @returns 资源引用信息
     */
    private findResInfoByAsset(asset: Asset): ResRefInfo | undefined {
        const key = this._uuidToKeyMap.get(asset.uuid);
        if (key) {
            return this._resRefMap.get(key);
        }

        // 回退：遍历兜底
        for (const info of this._resRefMap.values()) {
            if (info.asset === asset || info.asset.uuid === asset.uuid) {
                return info;
            }
        }
        return undefined;
    }

    /** 获取 Bundle 策略信息
     * @param packName 包名
     * @returns 策略信息（未设置则返回默认 Normal 策略）
     */
    private getBundlePolicyInfo(packName: string): BundlePolicyInfo {
        return this._bundlePolicyMap.get(packName) ?? {
            policy: EResBundlePolicy.Normal,
        };
    }

    /** 获取已加载的资源引用
     * @param info 资源引用信息
     */
    private acquireLoadedRes(info: ResRefInfo): void {
        if (info.policy === EResBundlePolicy.Core) {
            info.refs++;
            return;
        }

        if (info.policy === EResBundlePolicy.Hot && info.cached && info.refs === 0) {
            info.refs = 1;
            info.cached = false;
            this._hotLruMap.delete(this.getResKey(info.packName, info.resPath));
            return;
        }

        info.refs++;
        info.asset.addRef();
    }

    /** 获取或创建资源加载任务
     * @param resPath 资源路径
     * @param packName 包名
     * @returns 加载任务信息
     */
    private getOrCreateLoadTask(resPath: string, packName: string): LoadingResInfo {
        const key = this.getResKey(packName, resPath);

        const loadingInfo = this._loadingResMap.get(key);
        if (loadingInfo) {
            return loadingInfo;
        }

        const bundle = this._loadedPackList.get(packName);
        if (!bundle) {
            throw new Error(`资源包不存在。packName:${packName}`);
        }

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

        const newLoadingInfo: LoadingResInfo = {
            promise: task,
            refs: 0,
        };

        this._loadingResMap.set(key, newLoadingInfo);

        /**
         * FIX: 加载失败时清理 _loadingResMap，原逻辑已正确，保持不变。
         * 但原 loadRes 在 await 后的 if (info) 提前 return 分支中未执行
         * _loadingResMap.delete，现已统一在竞态修复分支中补 delete。
         */
        task.then(undefined, () => {
            if (this._loadingResMap.get(key) === newLoadingInfo) {
                this._loadingResMap.delete(key);
            }
        });

        return newLoadingInfo;
    }

    /** 加载 Core Bundle 的所有资源并固定引用
     * @param packName 包名
     * @param bundle Bundle 实例
     */
    private async loadCoreBundleAssets(packName: string, bundle: Bundle): Promise<void> {
        if (this._coreAssetMap.has(packName)) {
            return;
        }

        const assets = await new Promise<Asset[]>((resolve, reject) => {
            bundle.loadDir("", (err, data: Asset[]) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(data ?? []);
            });
        });

        const pinnedMap = new Map<string, Asset>();
        for (const asset of assets) {
            if (pinnedMap.has(asset.uuid)) {
                continue;
            }
            asset.addRef();
            pinnedMap.set(asset.uuid, asset);

            /**
             * FIX: loadBundle → loadedPackList.set → loadCoreBundleAssets 之间的窗口期内
             * 若有 loadRes 先行写入了 _resRefMap，此处将其标记为 corePinned，
             * 避免 Core 固定引用与业务引用的 managedRef 双重计数。
             */
            const key = this._uuidToKeyMap.get(asset.uuid);
            if (key) {
                const existingInfo = this._resRefMap.get(key);
                if (existingInfo && existingInfo.managedRef) {
                    // Core 固定已 addRef，业务持有的 managedRef addRef 仍然有效；
                    // 将 cached 标记同步，避免 releaseResInfo 时重复 decRef。
                    existingInfo.cached = true;
                    existingInfo.managedRef = false;
                }
            }
        }

        this._coreAssetMap.set(packName, pinnedMap);
    }

    /** 检查资源是否为 Core 固定资源
     * @param packName 包名
     * @param asset 资源实例
     * @returns 是否为固定资源
     */
    private isCoreAssetPinned(packName: string, asset: Asset): boolean {
        return this._coreAssetMap.get(packName)?.has(asset.uuid) ?? false;
    }

    /** 添加资源到热缓存
     * @param info 资源引用信息
     */
    private addHotCache(info: ResRefInfo): void {
        const key = this.getResKey(info.packName, info.resPath);
        this._hotLruMap.delete(key);
        this._hotLruMap.set(key, true);
        this.trimHotCache();
    }

    /** 裁剪热缓存至容量范围内 */
    private trimHotCache(): void {
        while (this._hotLruMap.size > this._hotCacheCapacity) {
            const evictKey = this._hotLruMap.keys().next().value as string | undefined;
            if (!evictKey) break;
            this.releaseHotCacheKey(evictKey);
        }
    }

    /** 清空指定包的热缓存
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

    /** 从 LRU map 删除指定包的缓存键（不再操作 _resRefMap，避免双重 decRef，资源释放统一由 releaseResInfo 负责）
     * @param packName 包名
     */
    private removeHotCacheByBundle(packName: string): void {
        for (const key of Array.from(this._hotLruMap.keys())) {
            const info = this._resRefMap.get(key);
            if (!info || info.packName === packName) {
                this._hotLruMap.delete(key);
            }
        }
    }

    /** 释放热缓存条目（只负责 LRU map 清理和 _resRefMap 删除，cached 资源在此释放保留引用）
     * @param key 资源键
     */
    private releaseHotCacheKey(key: string): void {
        this._hotLruMap.delete(key);
        const info = this._resRefMap.get(key);
        if (!info || info.refs > 0) {
            return;
        }

        // 释放热缓存保留的那一次 addRef
        if (info.cached) {
            info.asset.decRef();
            info.cached = false;
        }

        this.deleteResInfo(key);
    }

    /** 释放资源引用信息
     * @param info 资源引用信息
     */
    private releaseResInfo(info: ResRefInfo): void {
        const key = this.getResKey(info.packName, info.resPath);

        /**
         * FIX: 先从 _hotLruMap 删除键（不调用 releaseHotCacheKey，避免双重释放），
         * 再统一处理引用计数。
         */
        this._hotLruMap.delete(key);

        if (info.policy === EResBundlePolicy.Core) {
            if (info.managedRef) {
                for (let i = 0; i < info.refs; i++) {
                    info.asset.decRef();
                }
            }
            this.deleteResInfo(key);
            return;
        }

        // cached=true 时 refs=0，实际有 1 次保留引用需要释放
        const refCount = info.cached && info.refs === 0 ? 1 : info.refs;
        for (let i = 0; i < refCount; i++) {
            info.asset.decRef();
        }

        this.deleteResInfo(key);
    }

    /** 释放 Core Bundle 的固定资源引用
     * @param packName 包名
     */
    private releaseCorePinnedAssets(packName: string): void {
        const pinnedMap = this._coreAssetMap.get(packName);
        if (!pinnedMap) return;

        for (const asset of pinnedMap.values()) {
            asset.decRef();
        }

        this._coreAssetMap.delete(packName);
    }

    /** 统一删除资源信息入口（确保 _resRefMap 与 _uuidToKeyMap 始终同步）
     * @param key 资源键
     */
    private deleteResInfo(key: string): void {
        const info = this._resRefMap.get(key);
        if (info) {
            this._uuidToKeyMap.delete(info.asset.uuid);
        }
        this._resRefMap.delete(key);
    }

}