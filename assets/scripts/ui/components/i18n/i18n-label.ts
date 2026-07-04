import { _decorator, CCString, Component, Label } from "cc";
import { gcore } from "gcore";
import { GCoreEvent, gcoreEvent } from "@gcore/event";

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

	/** 占位参数 */
	@property({ type: [CCString], displayName: "Params", tooltip: "占位参数，按顺序替换 {0}、{1}..." })
	public params: string[] = [];

	/** 文本 */
	@property({ displayName: "Label", tooltip: "要显示文本的 Label 组件，如果不设置会自动获取当前节点上的 Label 组件" })
	public label: Label | undefined;

	/** 初始化 */
	protected onLoad(): void {
		if (!this.label) {
			this.label = this.getComponent(Label) ?? undefined;
		}
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
		if (!this.label || !this.i18nKey) {
			return;
		}
		this.label.string = gcore.i18n.getText(this.i18nKey);
	}

}
