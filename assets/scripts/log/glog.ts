
import { DEBUG } from "cc/env";
import { GCoreDefine } from "../define/gcore-define";

/** GCore调试管理器
 * 用于在开发过程中调试游戏
 * @author seamonster
 * @date 2025-11-15
 */
class GLog {

    /** 输出Log回调 */
    public logCallback: ((message: string) => void) | undefined;
    /** 输出Info时回调 */
    public infoCallback: ((message: string) => void) | undefined;
    /** 输出警告时的回调 */
    public warnCallback: ((message: string) => void) | undefined;
    /** 输出错误时的回调 */
    public errorCallback: ((message: string) => void) | undefined;

    /** 输出日志 */
    public log(message: string, color?: string) {
        if (color) {
            console.log(`%c ${message}`, color);
        } else {
            console.log(message);
        }

        if (this.logCallback) {
            this.logCallback(message);
        }
    }

    /** 输出调试日志 */
    public debug(message: string) {
        if (DEBUG) {
            this.log(message, GCoreDefine.LogColor.DEBUG_COLOR);
        }
    }

    /** 输出成功调试信息 */
    public debugSuccess(message: string) {
        if (DEBUG) {
            this.log(message, GCoreDefine.LogColor.SUCCESS_COLOR);
        }
    }

    /** 输出调试失败的信息 */
    public debugFailure(message: string) {
        if (DEBUG) {
            this.log(message, GCoreDefine.LogColor.FAILURE_COLOR);
        }
    }

    /** 输出运行信息 */
    public info(message: string) {
        this.info(message);
        if (this.infoCallback) {
            this.infoCallback(message);
        }
    }

    /** 输出错误 */
    public error(message: string) {
        this.log(message, GCoreDefine.LogColor.FAILURE_COLOR);
        if (this.errorCallback) {
            this.errorCallback(message);
        }
    }

}

export const glog = new GLog();