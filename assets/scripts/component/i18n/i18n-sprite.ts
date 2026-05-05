import { _decorator, Component, Sprite, SpriteFrame } from "cc";
import { gcore } from "../../gcore";
import { i18nMgr, II18nSpriteValue } from "../../core/i18n/i18nMgr";

const { ccclass, property, menu } = _decorator;

/** 多语言图片组件 */
@ccclass("I18nSprite")
@menu("GCore/I18n/I18nSprite")
export class I18nSprite extends Component {

	/** 多语言 key */
	@property({ displayName: "Key", tooltip: "多语言 key" })
	public i18nKey: string = "";

	/** 默认资源包 */
	@property({ displayName: "Pack", tooltip: "当 i18n 值只提供路径时，使用此资源包" })
	public packName: string = "resources";

	private _sprite: Sprite | null = null;
	private _refreshToken: number = 0;

	protected onLoad(): void {
		this._sprite = this.getComponent(Sprite);
	}

	protected onEnable(): void {
		i18nMgr.onLanguageChanged(this._onLanguageChanged, this);
		void this._refreshAsync();
	}

	protected onDisable(): void {
		i18nMgr.offLanguageChanged(this._onLanguageChanged, this);
	}

	/** 设置 key 并刷新 */
	public setI18nKey(key: string): void {
		this.i18nKey = key;
		void this._refreshAsync();
	}

	/** 语言变化 */
	private _onLanguageChanged(): void {
		void this._refreshAsync();
	}

	/** 刷新图片 */
	private async _refreshAsync(): Promise<void> {
		const token = ++this._refreshToken;

		if (!this._sprite) {
			this._sprite = this.getComponent(Sprite);
		}
		if (!this._sprite || !this._sprite.isValid || !this.i18nKey) {
			return;
		}

		const value = i18nMgr.getValue<unknown>(this.i18nKey);
		if (value === undefined || value === null) {
			return;
		}

		if (value instanceof SpriteFrame) {
			this._sprite.spriteFrame = value;
			return;
		}

		try {
			if (typeof value === "string") {
				await gcore.resMgr.setSprite(value, this.packName, this._sprite);
				return;
			}

			if (typeof value === "object") {
				const spriteValue = value as II18nSpriteValue;
				const packName = spriteValue.packName || this.packName;
				if (spriteValue.spriteFrameName) {
					await gcore.resMgr.setSpriteFormAtlas(spriteValue.resPath, spriteValue.spriteFrameName, packName, this._sprite);
				} else {
					await gcore.resMgr.setSprite(spriteValue.resPath, packName, this._sprite);
				}
			}
		} catch (error) {
			if (token === this._refreshToken) {
				console.error(`[I18nSprite] 加载失败 key:${this.i18nKey}`, error);
			}
		}
	}

}
