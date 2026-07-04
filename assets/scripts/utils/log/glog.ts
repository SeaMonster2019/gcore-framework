
import { DEBUG } from "cc/env";
import { GCoreDefine } from "../../define/gcore-define";

/** GCore调试管理器
 * 用于在开发过程中调试游戏
 * @author seamonster
 * @date 2025-11-15
 */
class GLog {

    /** 输出成功调试信息 */
    public debugSuccess(message?: any, ...optionalParams: any[]) {
            console.log(message, ...optionalParams, GCoreDefine.LogColor.SUCCESS_COLOR);
    }

    /** 输出调试失败的信息 */
    public debugFailure(message?: any, ...optionalParams: any[]) {
        if (DEBUG) {
            console.warn(message, ...optionalParams, GCoreDefine.LogColor.FAILURE_COLOR);
        }
    }

}

export const glog = new GLog();