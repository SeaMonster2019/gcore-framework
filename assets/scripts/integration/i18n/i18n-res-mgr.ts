import { SpriteFrame } from "cc";
import { EResBundlePolicy, gcoreRes } from "../res";
import { i18n } from "./i18n-mgr";

/** 图片多语言配置 */
export interface I18nResOptions {
    /** 默认语言标识，缺图时回退到该语言的资源包 */
    defaultLanguage: string;
    /** 语言标识归一化函数（如把 zh-CN 收敛为 zh-Hans） */
    normalize?: (language: string) => string;
    /** 语言标识到资源 Bundle 名称的映射，默认采用 pack-<lang> 约定 */
    packNameOf?: (language: string) => string;
    /** 编辑器预览时由 Bundle 名与资源路径推导 db 资源地址，默认按 assets/language/<pack>/<path> 查找 */
    previewUrlOf?: (packName: string, resPath: string) => string;
}

/** 图片加载结果：持有期间由调用方负责归还引用 */
export interface I18nSpriteLoadResult {
    /** 加载到的精灵帧 */
    frame: SpriteFrame;
    /** 实际命中的资源路径 */
    resPath: string;
    /** 实际命中的 Bundle 名称 */
    packName: string;
}

/** 程序多语言图片资源管理器：负责语言包映射、加载、回退与预热 */
export class I18nResMgr {

    /** 图片多语言配置，未调用 configure 时使用 pack-<lang> 默认约定 */
    private _opts: I18nResOptions = { defaultLanguage: "zh-Hans" };
    /** 已登记待预热的资源路径及其引用计数 */
    private _resPathRefs: Map<string, number> = new Map();

    /****************  公共方法  ****************/

    /** 注入业务侧的语言配置
     * @param options 图片多语言配置
     */
    public configure(options: I18nResOptions): void {
        this._opts = options;
    }

    /** 获取语言对应的资源 Bundle 名称
     * @param language 语言标识，缺省时取当前语言
     * @returns 资源 Bundle 名称
     */
    public getPackName(language: string = i18n.language): string {
        const raw = language || this._opts.defaultLanguage;
        const lang = this._opts.normalize?.(raw) ?? raw;
        return this._opts.packNameOf?.(lang) ?? `pack-${lang}`;
    }

    /** 获取缺图时回退的默认语言标识
     * @returns 默认语言标识
     */
    public get defaultLanguage(): string {
        return this._opts.defaultLanguage;
    }

    /** 生成编辑器预览用的候选 db 资源地址
     * @param packName 语言 Bundle 名称
     * @param resPath 语言 Bundle 内的资源路径
     * @returns 候选 db 地址列表，按优先级排列
     */
    public getEditorPreviewUrls(packName: string, resPath: string): string[] {
        const imagePath = resPath.replace(/\/spriteFrame$/, "");
        if (this._opts.previewUrlOf) {
            return [this._opts.previewUrlOf(packName, resPath)];
        }
        const base = `db://assets/language/${packName}/${imagePath}`;
        return [".png", ".jpg", ".jpeg", ".webp", ""].map((ext) => `${base}${ext}`);
    }

    /** 预设语言 Bundle 的资源生命周期策略，须在该 Bundle 被 gL10n 自动加载前调用
     * @param language 语言标识
     * @param policy 资源生命周期策略，默认 Hot
     */
    public async ensureBundle(language: string, policy: EResBundlePolicy = EResBundlePolicy.Hot): Promise<void> {
        await gcoreRes.loadBundle(this.getPackName(language), policy);
    }

    /** 登记需要预热的资源路径
     * @param resPath 语言 Bundle 内的资源路径
     */
    public registerResPath(resPath: string): void {
        if (!resPath) return;
        this._resPathRefs.set(resPath, (this._resPathRefs.get(resPath) ?? 0) + 1);
    }

    /** 注销预热的资源路径，引用归零后移除
     * @param resPath 语言 Bundle 内的资源路径
     */
    public unregisterResPath(resPath: string): void {
        const refs = this._resPathRefs.get(resPath);
        if (refs === undefined) return;
        if (refs <= 1) {
            this._resPathRefs.delete(resPath);
        } else {
            this._resPathRefs.set(resPath, refs - 1);
        }
    }

    /** 加载多语言图片：当前语言包 → 默认语言包，均失败返回 null
     * @param resPath 语言 Bundle 内的资源路径，各语言保持一致
     * @param language 语言标识，缺省时取当前语言
     * @returns 加载结果，调用方须在不再使用时调用 release 归还引用
     */
    public async loadSpriteFrame(resPath: string, language: string = i18n.language): Promise<I18nSpriteLoadResult | null> {
        if (!resPath) return null;

        const primary = this.getPackName(language);
        const fallback = this.getPackName(this._opts.defaultLanguage);
        const packs = primary === fallback ? [primary] : [primary, fallback];

        for (const packName of packs) {
            try {
                const frame = await gcoreRes.loadRes<SpriteFrame>(resPath, packName);
                if (frame instanceof SpriteFrame) {
                    return { frame, resPath, packName };
                }
                // 路径指向了非精灵帧资源，仍需归还本次 loadRes 增加的引用
                gcoreRes.releaseRes(resPath, packName);
            } catch {
                // 该语言包缺图或 Bundle 未就绪，继续回退到默认语言包
            }
        }

        console.warn(`[I18nRes] 图片资源加载失败: ${resPath} (${packs.join(" / ")})`);
        return null;
    }

    /** 归还图片资源引用，与 loadSpriteFrame 成对调用
     * @param result 加载结果
     */
    public release(result: I18nSpriteLoadResult): void {
        gcoreRes.releaseRes(result.resPath, result.packName);
    }

    /** 预热已登记的资源路径，供语言切换广播前调用
     * @param language 目标语言标识
     */
    public async preload(language: string): Promise<void> {
        const packName = this.getPackName(language);
        const paths = Array.from(this._resPathRefs.keys());
        await Promise.all(paths.map(async (resPath) => {
            try {
                await gcoreRes.loadRes<SpriteFrame>(resPath, packName);
                // 仅预热，立即归还引用；Hot 策略下资源会留在 LRU 缓存
                gcoreRes.releaseRes(resPath, packName);
            } catch {
                // 缺图交由组件运行时回退，预热不阻塞语言切换
            }
        }));
    }

    /** 清空预热登记表 */
    public clear(): void {
        this._resPathRefs.clear();
    }
}

/** 程序多语言图片资源管理器单例 */
export const i18nRes = new I18nResMgr();
