import { __private, Canvas, screen, view } from "cc";

type windowEventType = `window-resize` | `orientation-change` | `fullscreen-change`;

export class WindowMgr {

    /** 设计分辨率宽高比 */
    private _designAspectRatio: number = 1;
    /** 设计分辨率宽高比 */
    public get designAspectRatio() {
        return this._designAspectRatio;
    }

    /** 实际分辨率宽高比 */
    private _realAspectRatio: number = 1;
    /** 实际分辨率宽高比 */
    public get realAspectRatio() {
        return this._realAspectRatio;
    }

    /** 高差 */
    private _heightDifference: number = 0;
    public get heightDifference() {
        return this._heightDifference;
    }


    /** 初始化 */
    init() {
        this._onWindowResize();
        this.on(`window-resize`, this._onWindowResize.bind(this), this);
    }

    /** 销毁 */
    destroy() {
        this.off(`window-resize`, this._onWindowResize.bind(this), this);
    }

    /** 监听屏幕大小变化 */
    on(eventType: windowEventType, callback: (...args: any[]) => void, target?: any) {
        screen.on(eventType, callback, target)
    }

    /** 监听屏幕大小变化一次 */
    once(eventType: windowEventType, callback: (...args: any[]) => void, target?: any) {
        screen.once(eventType, callback, target)
    }

    /** 取消监听屏幕大小变化 */
    off(eventType: windowEventType, callback: (...args: any[]) => void, target?: any) {
        screen.off(eventType, callback, target);
    }

    /** 当视图变化时 */
    private _onWindowResize() {
        this._designAspectRatio = screen.windowSize.width / screen.windowSize.height;
        this._realAspectRatio = screen.windowSize.width / screen.windowSize.height;
    }

}