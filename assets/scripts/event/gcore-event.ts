import { EventTarget } from 'cc';

/** 事件系统 
 * @author seamonster
 * @date 2025-11-15
*/
export class GCoreEvent extends EventTarget {

    /** ui事件 */
    public static MVC_EVENT = {
        /** 注册视图
         * @param {number} tid 类型id
         * @param {IMvcParams} viewParam 视图参数
         */
        REGISTER_VIEW: `MVC_REGISTER_VIEW`,
        /** 打开视图
         * @param {number} tid 类型id
         * @param {BaseView} view 视图脚本
         */
        OPEN_VIEW: `MVC_OPEN_VIEW`,
        /** 关闭视图
         * @param {number} tid 类型id
         * @param {BaseView} view 视图脚本
         */
        CLOSE_VIEW: `MVC_CLOSE_VIEW`,
    }

    /** 资源加载事件 */
    public static RES_LOAD_EVENT = {
        /** 资源包加载完成
         * @param {string} bundleName 资源包名字
         */
        BUNDLE_LOAD_COMPLETE: `BUNDLE_LOAD_COMPLETE`,
    }

    /** 语言切换 */
    public static LANGUAGE_CHANGED = {
        /** 切换语言 - 无参数 */
        SWITCH_LANGUAGE: `SWITCH_LANGUAGE`,
        /** 切换语言
         * @param 切换的语言key
         */
        SWITCH_LANGUAGE_WITH_KEY: `SWITCH_LANGUAGE_WITH_KEY`,
    }

    /** 流程切换 */
    public static FSM_EVENT = {
        /** 进入流程
         * @param {string} fsmType 流程类型
         */
        ENTER: `FSM_ENTER`,
        /** 退出流程
         * @param {string} fsmType 流程类型
         */
        EXIT: `FSM_EXIT`,
    }
}

export const gcoreEvent = new GCoreEvent();
