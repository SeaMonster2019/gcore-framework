import { AnimationClip } from 'cc';

/** 存储配置 */
export const GCoreDefine = {

    /** log输出颜色 */
    LogColor: {
        /** 调试信息 */
        DEBUG_COLOR: "color: rgb(140, 182, 163);",
        /** 成功的信息 */
        SUCCESS_COLOR: "color: rgb(62, 184, 32);",
        /** 失败的信息 */
        FAILURE_COLOR: "color: rgb(220, 20, 60);",
        /** 网络层 */
        NETWORK_COLOR: "color: rgb(255, 165, 0);"
    },

    /** 默认lru大小 */
    DEFAULT_LRU_CAPACITY: 100,
}

/** 帧动画时间轴曲线，名称对应 Cocos Creator 内置 easing 方法 */
export enum EFrameAnimationCurve {
    Linear = 'linear',
    Smooth = 'smooth',
    Fade = 'fade',
    Constant = 'constant',
    QuadIn = 'quadIn',
    QuadOut = 'quadOut',
    QuadInOut = 'quadInOut',
    QuadOutIn = 'quadOutIn',
    CubicIn = 'cubicIn',
    CubicOut = 'cubicOut',
    CubicInOut = 'cubicInOut',
    CubicOutIn = 'cubicOutIn',
    QuartIn = 'quartIn',
    QuartOut = 'quartOut',
    QuartInOut = 'quartInOut',
    QuartOutIn = 'quartOutIn',
    QuintIn = 'quintIn',
    QuintOut = 'quintOut',
    QuintInOut = 'quintInOut',
    QuintOutIn = 'quintOutIn',
    SineIn = 'sineIn',
    SineOut = 'sineOut',
    SineInOut = 'sineInOut',
    SineOutIn = 'sineOutIn',
    ExpoIn = 'expoIn',
    ExpoOut = 'expoOut',
    ExpoInOut = 'expoInOut',
    ExpoOutIn = 'expoOutIn',
    CircIn = 'circIn',
    CircOut = 'circOut',
    CircInOut = 'circInOut',
    CircOutIn = 'circOutIn',
    ElasticIn = 'elasticIn',
    ElasticOut = 'elasticOut',
    ElasticInOut = 'elasticInOut',
    ElasticOutIn = 'elasticOutIn',
    BackIn = 'backIn',
    BackOut = 'backOut',
    BackInOut = 'backInOut',
    BackOutIn = 'backOutIn',
    BounceIn = 'bounceIn',
    BounceOut = 'bounceOut',
    BounceInOut = 'bounceInOut',
    BounceOutIn = 'bounceOutIn'
}