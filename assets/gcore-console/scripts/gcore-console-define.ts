/****************  日志  ****************/

/** 控制台日志级别 */
export enum EConsoleLogLevel {
    /** 普通日志 */
    Log = 0,
    /** 警告 */
    Warn = 1,
    /** 错误 */
    Error = 2,
    /** 系统提示（控制台自身输出，如指令注册、帮助信息） */
    System = 3,
    /** 指令回显（用户输入与原样输出） */
    Command = 4,
}

/** 控制台日志项 */
export interface IConsoleLogItem {
    /** 日志级别 */
    level: EConsoleLogLevel;
    /** 日志内容 */
    text: string;
    /** 时间戳（毫秒） */
    time: number;
}

/****************  指令  ****************/

/** 指令参数定义，用于生成用法说明与校验必填参数 */
export interface IConsoleParamDef {
    /** 参数名，展示为 <参数名> */
    name: string;
    /** 参数说明 */
    desc?: string;
    /** 是否可选，缺省为必填 */
    optional?: boolean;
    /** 缺省值，传入空字符串时取该值 */
    defaultValue?: string;
}

/** 指令处理函数
 * @param args 解析后的参数列表（已按空格切分并去除引号）
 * @param raw 用户原始输入
 * @returns 返回字符串时自动作为一条日志输出到控制台
 */
export type ConsoleCommandHandler = (args: string[], raw: string) => void | string;

/** 控制台指令定义 */
export interface IConsoleCommand {
    /** 指令名，不区分大小写（注册时统一转小写） */
    name: string;
    /** 指令说明 */
    desc?: string;
    /** 用法示例，缺省时由参数定义自动推导 */
    usage?: string;
    /** 参数定义 */
    params?: IConsoleParamDef[];
    /** 处理函数 */
    handler: ConsoleCommandHandler;
    /** 所属分组，用于 help 分组展示 */
    group?: string;
}

/****************  初始化选项  ****************/

/** 控制台初始化选项 */
export interface IConsoleOptions {
    /** 日志最大保留条数，超出后丢弃最早的日志 */
    maxLogCount?: number;
    /** 历史指令最大保留条数 */
    maxHistoryCount?: number;
    /** 是否接管 console.log/warn/error 的输出同步到控制台，默认关闭 */
    captureConsole?: boolean;
}

/****************  视图契约  ****************/

/** 控制台视图接口
 * 由 `GCoreConsoleView` 实现，管理器只依赖该接口，避免与视图类产生循环依赖
 */
export interface IConsoleView {
    /** 日志或指令发生变化时的刷新通知 */
    onLogChanged(): void;
    /** 设置控制台显隐 */
    setVisible(visible: boolean): void;
    /** 控制台是否可见 */
    isVisible(): boolean;
    /** 聚焦到输入框 */
    focusInput(): void;
}

/****************  候选项常量  ****************/

/** 候选选择框默认展示行数（与预制体 place-candidate 下的候选项文本数量保持一致） */
export const CONSOLE_CANDIDATE_ROW_COUNT = 6;
