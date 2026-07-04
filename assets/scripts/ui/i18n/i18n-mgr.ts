import msgpack from "@msgpack/msgpack";
import { JsonAsset } from "cc";
import { gcoreEvent, GCoreEvent } from "@gcore/event";


/** 多语言管理器 */
export class I18nMgr {

	/** 当前语言 */
	private _language: string = "Chinese";
	/** 语言表集合 */
	private _textMap: Map<string, string> = new Map();

	/** 初始化 */
	public init(): void {}

	/** 获取当前语言 */
	public getLanguageKey(): string {
		return this._language;
	}

	/** 获取字符串 */
	public getText(key: string): string {
		const hasKey = this._textMap.has(key);
		if (!hasKey) {
			console.warn(`I18nMgr: 语言表中不存在key: ${key}`);
		}
		return this._textMap.get(key) || ``;
	}

	/** 是否存在语言表 */
	public hasLanguage(language: string): boolean {
		return this._textMap.has(language);
	}

	/** 清空语言表 */
	public clearLanguage(language?: string): void {
		if (!language) {
			this._textMap.clear();
			return;
		}
		this._textMap.delete(language);
	}

	/** 从对象中解析 */
	public loadLanguageFromObject(languageKey: string, source: Record<string, string>):void {
		this.setLanguageMap(languageKey, source);
	}	

	/** 从 JSON 加载语言表 */
	public loadLanguageFromJson(language: string, source: string | JsonAsset):void  {
		if (typeof source === "string") {
			const parsed = JSON.parse(source) as Record<string, string>;
			this.setLanguageMap(language, parsed);
		}else if (source instanceof JsonAsset) {
			const parsed = source.json as Record<string, string>;
			this.setLanguageMap(language, parsed);
		}
	}

	/** 从 MessagePack 加载语言表 */
	public loadLanguageFromMessagePack(language: string, source: ArrayBuffer | Uint8Array):void {
		const uint8 = source instanceof Uint8Array ? source : new Uint8Array(source);
		const decodeFn = (msgpack as any).decode ?? (msgpack as any).default?.decode ?? (msgpack as any);
		const decoded: Record<string, string> = decodeFn(uint8) as Record<string, string>;
		return this.setLanguageMap(language, decoded);
	}

	/** 设置语言表 */
	public setLanguageMap(languageKey: string, table: Record<string, string>):void  {
		this._language = languageKey;
		this._textMap = new Map<string,string>();
		for (const key in table) {
			this._textMap.set(key, table[key]);
		}
		this._emitLanguageChanged(languageKey);
	}

	/** 广播语言切换 */
	private _emitLanguageChanged(languageKey:string): void {
		gcoreEvent.emit(GCoreEvent.LANGUAGE_CHANGED.SWITCH_LANGUAGE);
		gcoreEvent.emit(GCoreEvent.LANGUAGE_CHANGED.SWITCH_LANGUAGE_WITH_KEY, languageKey);
	}

}
