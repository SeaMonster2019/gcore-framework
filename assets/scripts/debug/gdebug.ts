import { Camera, EventTouch, game, Node, UITransform, Vec3 } from "cc";
import { DEBUG } from "cc/env";
import { glog } from "../log/glog";

/** 注入调试 */
function initDebug() {
    if (DEBUG) {
        (window as any)["game"] = game;
        (window as any)["debug"] = {};
    }
}
initDebug();

/** 调试工具集 */
class GDebug {

    /** 添加点击调试 */
    public addTouchDebug2D(node: Node, camera: Camera, func?: Function,) {
        if (DEBUG) {
            const uit = node.getComponent(UITransform);
            if (!uit) {
                glog.error("节点没有UITransform组件");
                return;
            }
            node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
                const uiPos = new Vec3(event.getLocation().x, event.getLocation().y, 0);
                const wpos = camera.screenToWorld(uiPos);
                const arPos = uit.convertToNodeSpaceAR(wpos);
                glog.log(`点击Ui坐标 x：${uiPos.x},y ${uiPos.y}\n点击世界坐标 x:${wpos.x}, y:${wpos.y}\n点击本地坐标 x:${arPos.x}, y:${arPos.y}`);
                func?.();
            }, this);
        }
    }

    /** 添加调试函数
     * @param key 调试函数名
     * @param func 调试函数
     */
    public addDebugFunc(key: string, func: Function) {
        if (DEBUG) {
            glog.debug("%c 添加调试函数:" + key);
            (window as any)["debug"][key] = func;
        }
    }

}

/**  调试工具集 */
export const gdebug = new GDebug();