
import { DEBUG } from "cc/env";
import { GCoreDefine } from "../define/gcore-define";

/** GCore调试管理器
 * 用于在开发过程中调试游戏
 * @author seamonster
 * @date 2025-11-15
 */
class GLog {

    /** 输出Log回调 */
    public logCallback: ((message?: any, ...optionalParams: any[]) => void) | undefined;
    /** 输出Info时回调 */
    public infoCallback: ((message?: any, ...optionalParams: any[]) => void) | undefined;
    /** 输出警告时的回调 */
    public warnCallback: ((message?: any, ...optionalParams: any[]) => void) | undefined;
    /** 输出错误时的回调 */
    public errorCallback: ((message?: any, ...optionalParams: any[]) => void) | undefined;

    /** 输出日志 */
    public log(message?: any, ...optionalParams: any[]) {
        console.log(message, ...optionalParams);
        if (this.logCallback) {
            this.logCallback(message, ...optionalParams);
        }
    }

    /** 输出调试日志 */
    public debug(message?: any, ...optionalParams: any[]) {
        if (DEBUG) {
            this.log(message, ...optionalParams, GCoreDefine.LogColor.DEBUG_COLOR);
        }
    }

    /** 输出成功调试信息 */
    public debugSuccess(message?: any, ...optionalParams: any[]) {
        if (DEBUG) {
            this.log(message, ...optionalParams, GCoreDefine.LogColor.SUCCESS_COLOR);
        }
    }

    /** 输出调试失败的信息 */
    public debugFailure(message?: any, ...optionalParams: any[]) {
        if (DEBUG) {
            this.log(message, ...optionalParams, GCoreDefine.LogColor.FAILURE_COLOR);
        }
    }

    /** 输出运行信息 */
    public info(message?: any, ...optionalParams: any[]) {
        console.info(message, ...optionalParams);
        if (this.infoCallback) {
            this.infoCallback(message, ...optionalParams);
        }
    }

    /** 输出警告 */
    public warn(message?: any, ...optionalParams: any[]) {
        console.warn(message, ...optionalParams);
        if (this.warnCallback) {
            this.warnCallback(message, ...optionalParams);
        }
    }

    /** 输出错误 */
    public error(message?: any, ...optionalParams: any[]) {
        this.log(message, ...optionalParams, GCoreDefine.LogColor.FAILURE_COLOR);
        if (this.errorCallback) {
            this.errorCallback(message, ...optionalParams);
        }
    }

}

export const glog = new GLog();