import { _decorator, CCObjectFlags, Component, Node, Sprite, SpriteFrame, UITransform } from "cc";
import { EDITOR } from "cc/env";
import { GCoreEvent, gcoreEvent } from "../../../system/event";
import { I18nEditorUtil } from "../editor/i18n-editor-util";
import { i18n } from "../i18n-mgr";
import { I18nSpriteLoadResult, i18nRes } from "../i18n-res-mgr";

const { ccclass, property, menu, executeInEditMode } = _decorator;

/** 程序多语言图片组件 */
@ccclass("I18nSprite")
@menu("Game/I18n/I18nSprite")
@executeInEditMode
export class I18nSprite extends Component {

    /** 语言 Bundle 内的资源路径，各语言必须完全一致 */
    @property({ displayName: "ResPath", tooltip: "语言 Bundle 内的资源路径，各语言保持一致，如 texture/ui/title/spriteFrame" })
    public resPath = "";

    /** 目标精灵组件 */
    @property({ type: Sprite, displayName: "Sprite", tooltip: "留空时自动取同节点上的 Sprite" })
    public sprite: Sprite | null = null;

    /** 编辑器下按语言面板选中的预览语言显示对应图片 */
    @property({ displayName: "Editor Preview", tooltip: "编辑器下按预览语言显示对应图片，预览节点不会保存到 prefab" })
    public editorPreview = true;

    /** 预制体上静态绑定的兜底精灵帧，未经 loadRes 不可归还引用 */
    private _fallbackFrame: SpriteFrame | null = null;
    /** 当前持有引用的加载结果 */
    private _active: I18nSpriteLoadResult | null = null;
    /** 刷新序号，用于丢弃语言连切时的过期请求 */
    private _token = 0;
    /** 编辑器预览用的临时子节点 */
    private _previewNode: Node | null = null;
    /** 编辑器当前已处理的预览语言，用于过滤 500ms 轮询产生的重复刷新 */
    private _editorPreviewLang = "";
    /** 编辑器预览加载序号，用于丢弃过期请求 */
    private _editorToken = 0;

    /****************  生命周期方法  ****************/

    /** 节点加载 */
    protected onLoad(): void {
        if (!this.sprite) {
            this.sprite = this.getComponent(Sprite);
        }
        if (this.sprite) {
            this._fallbackFrame = this.sprite.spriteFrame;
        }
    }

    /** 节点使能 */
    protected onEnable(): void {
        if (this.resPath) {
            i18nRes.registerResPath(this.resPath);
        }
        gcoreEvent.on(GCoreEvent.LANGUAGE_CHANGED.SWITCH_LANGUAGE, this.refresh, this);
        // 重新打开预制体时强制重新载入一次预览图
        if (EDITOR) {
            this._editorPreviewLang = "";
        }
        this.refresh();
    }

    /** 节点禁用 */
    protected onDisable(): void {
        gcoreEvent.off(GCoreEvent.LANGUAGE_CHANGED.SWITCH_LANGUAGE, this.refresh, this);
        // 使在途请求全部失效，避免组件禁用后仍写入精灵帧
        this._token++;
        this._editorToken++;
        this._releaseActive();
        if (EDITOR) {
            this._destroyPreviewNode();
            this._editorPreviewLang = "";
        }
        if (this.resPath) {
            i18nRes.unregisterResPath(this.resPath);
        }
    }

    /****************  公共方法  ****************/

    /** 刷新图片显示
     * @param language 目标语言标识，编辑器下忽略并改用语言面板的预览语言
     */
    public refresh(language?: string): void {
        if (EDITOR) {
            void this._refreshEditorPreview();
            return;
        }
        void this._loadAndApply(language);
    }

    /****************  私有方法  ****************/

    /** 异步加载并应用图片，统一处理异常与过期请求 */
    private async _loadAndApply(language?: string): Promise<void> {
        const sprite = this.sprite;
        if (EDITOR || !sprite || !this.resPath) {
            return;
        }

        const token = ++this._token;
        try {
            const result = await i18nRes.loadSpriteFrame(this.resPath, language);

            // 语言已再次切换或组件失效：归还本次引用，不写入画面
            if (token !== this._token || !this.isValid || !sprite.isValid) {
                if (result) {
                    i18nRes.release(result);
                }
                return;
            }

            // 先加载成功再释放旧图，避免切换瞬间出现空白帧
            this._releaseActive();
            sprite.spriteFrame = result ? result.frame : this._fallbackFrame;
            this._active = result;
        } catch (e) {
            console.warn(`[I18nSprite] 刷新图片失败: ${this.resPath}`, e);
        }
    }

    /** 编辑器下按预览语言加载并显示对应图片 */
    private async _refreshEditorPreview(): Promise<void> {
        if (!this.editorPreview) {
            this._destroyPreviewNode();
            this._editorPreviewLang = "";
            return;
        }
        if (!this.sprite || !this.resPath) {
            return;
        }

        // 优先读 CSV 轮询维护的内存值，避免每 500ms 对每个组件做一次同步文件 IO
        const lang = i18n.editorPreviewLang || I18nEditorUtil.getPreviewLanguage();
        // i18n-mgr 在编辑器下每 500ms 强制广播一次，语言未变时不重复发起资源查询
        if (lang === this._editorPreviewLang) {
            return;
        }
        this._editorPreviewLang = lang;

        const token = ++this._editorToken;
        const packName = i18nRes.getPackName(lang);
        const fallbackPack = i18nRes.getPackName(i18nRes.defaultLanguage);
        const urls = i18nRes.getEditorPreviewUrls(packName, this.resPath);
        if (fallbackPack !== packName) {
            urls.push(...i18nRes.getEditorPreviewUrls(fallbackPack, this.resPath));
        }

        const frame = await I18nEditorUtil.loadEditorSpriteFrame(urls);
        // 预览语言又变了或组件已失效，丢弃本次结果
        if (token !== this._editorToken || !this.isValid || !this.sprite?.isValid) {
            return;
        }

        if (frame) {
            this._applyPreviewFrame(frame);
        } else {
            // 找不到预览图时移除覆盖层，露出预制体上的静态兜底图
            this._destroyPreviewNode();
        }
        I18nEditorUtil.notifyEditorUpdate(this.sprite);
    }

    /** 创建或复用不落盘的预览子节点并应用精灵帧 */
    private _applyPreviewFrame(frame: SpriteFrame): void {
        let node = this._previewNode;
        if (!node || !node.isValid) {
            node = new Node("__i18n_sprite_preview__");
            // DontSave 不写入 prefab / EditorOnly 不进构建 / HideInHierarchy 不在层级面板显示
            node.hideFlags = CCObjectFlags.DontSave | CCObjectFlags.EditorOnly | CCObjectFlags.HideInHierarchy;
            node.layer = this.node.layer;
            this.node.addChild(node);
            node.addComponent(UITransform);
            const previewSprite = node.addComponent(Sprite);
            previewSprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this._previewNode = node;
        }

        const parentTransform = this.node.getComponent(UITransform);
        const transform = node.getComponent(UITransform);
        if (parentTransform && transform) {
            // 与父节点同尺寸同锚点，使预览图恰好覆盖原图且不改动原有 Sprite 属性
            transform.setContentSize(parentTransform.contentSize);
            transform.setAnchorPoint(parentTransform.anchorPoint.x, parentTransform.anchorPoint.y);
        }
        const previewSprite = node.getComponent(Sprite);
        if (previewSprite) {
            previewSprite.spriteFrame = frame;
        }
    }

    /** 销毁预览子节点 */
    private _destroyPreviewNode(): void {
        if (this._previewNode?.isValid) {
            this._previewNode.destroy();
        }
        this._previewNode = null;
    }

    /** 归还当前持有的图片资源引用，并同步摘下精灵帧，避免渲染已释放的资源 */
    private _releaseActive(): void {
        if (this._active) {
            if (this.sprite?.isValid) {
                this.sprite.spriteFrame = this._fallbackFrame;
            }
            i18nRes.release(this._active);
            this._active = null;
        }
    }
}
