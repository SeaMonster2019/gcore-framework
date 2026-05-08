import { _decorator, CCString, Component, RichText } from "cc";
import { gcore } from "../../gcore";
import { GCoreEvent, gcoreEvent } from "../../event/gcore-event";

const { ccclass, property, menu } = _decorator;

/** 多语言富文本组件 */
@ccclass("I18nRichText")
@menu("GCore/I18n/I18nRichText")
export class I18nRichText extends Component {

	/** 多语言 key */
	@property({ displayName: "Key", tooltip: "多语言 key" })
	public i18nKey: string = "";

	/** 默认文本 */
	@property({ displayName: "Fallback", tooltip: "当 key 不存在时显示的默认文本" })
	public fallback: string = "";

	/** 占位参数，支持 {0}、{1} */
	@property({ type: [CCString], displayName: "Params", tooltip: "占位参数，按顺序替换 {0}、{1}..." })
	public params: string[] = [];

	private _richText: RichText | null = null;

	protected onLoad(): void {
		this._richText = this.getComponent(RichText);
	}

	/** 激活 */
	protected onEnable(): void {
		gcoreEvent.on(GCoreEvent.LANGUAGE_CHANGED.SWITCH_LANGUAGE, this._refresh, this);
		this._refresh();
	}	

	/** 失活 */
	protected onDisable(): void {
		gcoreEvent.off(GCoreEvent.LANGUAGE_CHANGED.SWITCH_LANGUAGE, this._refresh, this);
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
		if (!this._richText) {
			this._richText = this.getComponent(RichText);
		}
		if (!this._richText) {
			return;
		}

		const fallback = this.fallback || this.i18nKey;
		this._richText.string = gcore.i18n.getText(this.i18nKey);
	}

}
