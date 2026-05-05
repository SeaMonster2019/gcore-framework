import { _decorator, CCString, Component, Label } from "cc";
import { gcore } from "../../gcore";

const { ccclass, property, menu } = _decorator;

/** 多语言文本组件 */
@ccclass("I18nLabel")
@menu("GCore/I18n/I18nLabel")
export class I18nLabel extends Component {

	/** 多语言 key */
	@property({ displayName: "Key", tooltip: "多语言 key" })
	public i18nKey: string = "";

	/** 默认文本 */
	@property({ displayName: "Fallback", tooltip: "当 key 不存在时显示的默认文本" })
	public fallback: string = "";

	/** 占位参数，支持 {0}、{1} */
	@property({ type: [CCString], displayName: "Params", tooltip: "占位参数，按顺序替换 {0}、{1}..." })
	public params: string[] = [];

	private _label: Label | null = null;

	protected onLoad(): void {
		this._label = this.getComponent(Label);
	}

	protected onEnable(): void {
	    gcore.i18nMgr.onLanguageChanged(this._refresh, this);
		this._refresh();
	}

	protected onDisable(): void {
		gcore.i18nMgr.offLanguageChanged(this._refresh, this);
	}

	/** 设置 key 并刷新 */
	public setI18nKey(key: string, fallback?: string, params?: Array<string | number>): void {
		this.i18nKey = key;
		if (fallback !== undefined) {
			this.fallback = fallback;
		}
		if (params) {
			this.params = params.map((item) => String(item));
		}
		this._refresh();
	}

	/** 刷新文本 */
	private _refresh(): void {
		if (!this._label) {
			this._label = this.getComponent(Label);
		}
		if (!this._label) {
			return;
		}

		const fallback = this.fallback || this.i18nKey;
		this._label.string = gcore.i18nMgr.getText(this.i18nKey, fallback, this.params);
	}

}
