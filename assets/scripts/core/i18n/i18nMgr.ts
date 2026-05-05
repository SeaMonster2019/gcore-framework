import { JsonAsset } from "cc";
import { decode } from "@msgpack/msgpack";

export type I18nPrimitive = string | number | boolean | null;
export type I18nValue = I18nPrimitive | Record<string, unknown> | unknown[];
export type I18nTable = Record<string, I18nValue>;

export interface II18nSpriteValue {
	/** 资源包名 */
	packName?: string;
	/** 资源路径 */
	resPath: string;
	/** 图集中的精灵帧名（可选） */
	spriteFrameName?: string;
}

interface II18nListener {
	callback: (language: string) => void;
	target?: unknown;
}

/** 多语言管理器 */
export class I18nMgr {

	/** 当前语言 */
	private _language: string = "zh";
	/** 语言表集合 */
	private _languageTables: Map<string, I18nTable> = new Map();
	/** 语言变更监听 */
	private _listeners: II18nListener[] = [];

	/** 初始化 */
	public init(defaultLanguage: string = "zh"): void {
		this._language = defaultLanguage;
	}

	/** 当前语言 */
	public get language(): string {
		return this._language;
	}

	/** 切换语言 */
	public setLanguage(language: string): boolean {
		if (!language || this._language === language) {
			return false;
		}

		this._language = language;
		this._emitLanguageChanged();
		return true;
	}

	/** 是否存在语言表 */
	public hasLanguage(language: string): boolean {
		return this._languageTables.has(language);
	}

	/** 清空语言表 */
	public clearLanguage(language?: string): void {
		if (!language) {
			this._languageTables.clear();
			return;
		}
		this._languageTables.delete(language);
	}

	/** 合并语言表（会将嵌套对象拍平为 dot key） */
	public mergeLanguage(language: string, table: Record<string, unknown>): number {
		const oldTable = this._languageTables.get(language) ?? {};
		const flatTable = this._flattenTable(table);
		this._languageTables.set(language, {
			...oldTable,
			...flatTable,
		});

		return Object.keys(flatTable).length;
	}

	/** 从 JSON 加载语言表 */
	public loadLanguageFromJson(language: string, source: string | JsonAsset | Record<string, unknown>): number {
		const table = this._parseJsonSource(source);
		return this.mergeLanguage(language, table);
	}

	/** 从 MessagePack 加载语言表 */
	public loadLanguageFromMessagePack(language: string, source: ArrayBuffer | Uint8Array): number {
		const decoded = decode(source instanceof Uint8Array ? source : new Uint8Array(source));
		if (!this._isPlainObject(decoded)) {
			throw new Error("MessagePack 顶层结构必须是对象");
		}
		return this.mergeLanguage(language, decoded);
	}

	/** 获取原始值 */
	public getValue<T = unknown>(key: string, language?: string): T | undefined {
		const lang = language ?? this._language;
		const table = this._languageTables.get(lang);
		if (!table) {
			return undefined;
		}
		return table[key] as T | undefined;
	}

	/** 获取文本 */
	public getText(key: string, fallback?: string, params?: Array<string | number>, language?: string): string {
		const value = this.getValue<unknown>(key, language);
		if (value === undefined || value === null) {
			return fallback ?? key;
		}

		const text = typeof value === "string" ? value : String(value);
		if (!params || params.length <= 0) {
			return text;
		}

		return text.replace(/\{(\d+)\}/g, (_sub: string, indexText: string) => {
			const index = Number(indexText);
			const param = params[index];
			return param === undefined ? "" : String(param);
		});
	}

	/** 监听语言切换 */
	public onLanguageChanged(callback: (language: string) => void, target?: unknown): void {
		const exists = this._listeners.some((item) => item.callback === callback && item.target === target);
		if (exists) {
			return;
		}
		this._listeners.push({ callback, target });
	}

	/** 取消监听语言切换 */
	public offLanguageChanged(callback: (language: string) => void, target?: unknown): void {
		const index = this._listeners.findIndex((item) => item.callback === callback && item.target === target);
		if (index >= 0) {
			this._listeners.splice(index, 1);
		}
	}

	/** 解析 JSON 文本 */
	private _parseJsonSource(source: string | JsonAsset | Record<string, unknown>): Record<string, unknown> {
		if (typeof source === "string") {
			const parsed = JSON.parse(source) as unknown;
			if (!this._isPlainObject(parsed)) {
				throw new Error("JSON 顶层结构必须是对象");
			}
			return parsed;
		}

		if (source instanceof JsonAsset) {
			const parsed = source.json as unknown;
			if (!this._isPlainObject(parsed)) {
				throw new Error("JsonAsset 顶层结构必须是对象");
			}
			return parsed;
		}

		if (!this._isPlainObject(source)) {
			throw new Error("语言表数据必须是对象");
		}

		return source;
	}

	/** 拍平语言表对象 */
	private _flattenTable(source: Record<string, unknown>): I18nTable {
		const target: I18nTable = {};

		const walk = (value: unknown, currentPath: string) => {
			if (this._isPlainObject(value)) {
				const keys = Object.keys(value);
				if (keys.length <= 0) {
					target[currentPath] = "";
					return;
				}
				for (let i = 0; i < keys.length; i++) {
					const k = keys[i];
					const nextPath = currentPath ? `${currentPath}.${k}` : k;
					walk(value[k], nextPath);
				}
				return;
			}

			target[currentPath] = value as I18nValue;
		};

		const rootKeys = Object.keys(source);
		for (let i = 0; i < rootKeys.length; i++) {
			const key = rootKeys[i];
			walk(source[key], key);
		}

		return target;
	}

	/** 是否普通对象 */
	private _isPlainObject(value: unknown): value is Record<string, unknown> {
		if (!value || typeof value !== "object") {
			return false;
		}
		if (Array.isArray(value)) {
			return false;
		}
		return Object.prototype.toString.call(value) === "[object Object]";
	}

	/** 广播语言切换 */
	private _emitLanguageChanged(): void {
		for (let i = 0; i < this._listeners.length; i++) {
			const listener = this._listeners[i];
			listener.callback.call(listener.target, this._language);
		}
	}

}
