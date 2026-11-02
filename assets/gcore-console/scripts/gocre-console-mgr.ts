import { ConsoleCommandHandler, EConsoleLogLevel, IConsoleCommand, IConsoleLogItem, IConsoleOptions, IConsoleView } from "./gcore-console-define";

// 类型定义统一迁移到 gcore-console-define，此处转发导出，保证"从管理器导入类型"的既有写法仍然可用
export * from "./gcore-console-define";

/****************  管理器  ****************/

/** 控制台管理器
 * 全局单例 `gcoreConsole`，负责指令注册、输入解析、指令执行、日志缓存与历史记录
 * @example
 * gcoreConsole.register({
 *     name: "addGold",
 *     desc: "增加金币",
 *     params: [{ name: "count", desc: "数量", defaultValue: "100" }],
 *     handler: (args) => `已增加金币 ${args[0]}`,
 * });
 */
class ConsoleMgr {

    /** 默认日志最大保留条数 */
    public static readonly DEFAULT_MAX_LOG_COUNT = 300;
    /** 默认历史指令最大保留条数 */
    public static readonly DEFAULT_MAX_HISTORY_COUNT = 50;
    /** 指令候选最大返回条数 */
    public static readonly MAX_MATCH_COUNT = 12;
    /** 模糊匹配分数基数，用于保证加分与优惠抵扣后分数始终为正数 */
    public static readonly FUZZY_SCORE_BASE = 1000;
    /** 内置指令分组名 */
    private static readonly BUILTIN_GROUP = "内置";

    /** 是否已初始化 */
    private _inited: boolean = false;
    /** 是否允许执行指令 */
    private _enabled: boolean = true;
    /** 指令映射表（指令名 -> 指令定义） */
    private _commandMap: Map<string, IConsoleCommand> = new Map();
    /** 日志列表 */
    private _logList: IConsoleLogItem[] = [];
    /** 历史指令列表 */
    private _historyList: string[] = [];
    /** 日志最大保留条数 */
    private _maxLogCount: number = ConsoleMgr.DEFAULT_MAX_LOG_COUNT;
    /** 历史指令最大保留条数 */
    private _maxHistoryCount: number = ConsoleMgr.DEFAULT_MAX_HISTORY_COUNT;
    /** 当前绑定的视图 */
    private _view: IConsoleView | null = null;
    /** 是否被 console 接管函数正在回调中（防止日志递归） */
    private _capturing: boolean = false;
    /** 原始的 console.log */
    private _originLog: ((...args: any[]) => void) | null = null;
    /** 原始的 console.warn */
    private _originWarn: ((...args: any[]) => void) | null = null;
    /** 原始的 console.error */
    private _originError: ((...args: any[]) => void) | null = null;

    /****************  生命周期  ****************/

    /** 初始化控制台管理器，注册内置指令（可重复调用，仅首次生效）
     * @param options 初始化选项
     */
    public init(options: IConsoleOptions = {}): void {
        if (this._inited) {
            return;
        }
        this._inited = true;
        this._maxLogCount = Math.max(1, options.maxLogCount ?? ConsoleMgr.DEFAULT_MAX_LOG_COUNT);
        this._maxHistoryCount = Math.max(1, options.maxHistoryCount ?? ConsoleMgr.DEFAULT_MAX_HISTORY_COUNT);

        this._registerBuiltinCommands();

        if (options.captureConsole) {
            this.setCaptureConsole(true);
        }
    }

    /** 销毁管理器，还原被接管的 console 并清理缓存 */
    public destroy(): void {
        this.setCaptureConsole(false);
        this.setView(null);
        this._commandMap.clear();
        this._logList.length = 0;
        this._historyList.length = 0;
        this._inited = false;
    }

    /****************  指令注册  ****************/

    /** 注册一条指令
     * @param command 指令定义
     * @returns 是否注册成功（重名或缺少处理函数时失败）
     */
    public register(command: IConsoleCommand): boolean {
        const name = (command.name || "").trim().toLowerCase();
        if (!name) {
            console.error(`注册控制台指令失败：指令名为空`);
            return false;
        }
        if (typeof command.handler !== "function") {
            console.error(`注册控制台指令失败：${name} 缺少处理函数`);
            return false;
        }
        if (this._commandMap.has(name)) {
            console.warn(`控制台指令重复注册，已覆盖：${name}`);
        }
        this._commandMap.set(name, { ...command, name });
        console.log(`%c 注册控制台指令:${name}`, "color: blue;");
        return true;
    }

    /** 以函数形式快速注册一条指令
     * @param name 指令名
     * @param handler 处理函数
     * @param desc 指令说明
     * @returns 是否注册成功
     */
    public registerFunc(name: string, handler: ConsoleCommandHandler, desc?: string): boolean {
        return this.register({ name, handler, desc });
    }

    /** 批量注册指令
     * @param commands 指令定义列表
     * @returns 成功注册的条数
     */
    public registerAll(commands: IConsoleCommand[]): number {
        let count = 0;
        for (const command of commands) {
            if (this.register(command)) {
                count++;
            }
        }
        return count;
    }

    /** 注销指令
     * @param name 指令名
     * @returns 是否成功注销
     */
    public unregister(name: string): boolean {
        return this._commandMap.delete((name || "").trim().toLowerCase());
    }

    /** 清空所有已注册的指令（内置指令也会被清除，通常仅用于测试） */
    public clearCommands(): void {
        this._commandMap.clear();
    }

    /****************  指令查询  ****************/

    /** 是否存在指定指令
     * @param name 指令名
     */
    public hasCommand(name: string): boolean {
        return this._commandMap.has((name || "").trim().toLowerCase());
    }

    /** 获取指令定义
     * @param name 指令名
     */
    public getCommand(name: string): IConsoleCommand | undefined {
        return this._commandMap.get((name || "").trim().toLowerCase());
    }

    /** 获取全部指令（按名称升序）
     * @returns 指令定义列表
     */
    public getCommands(): IConsoleCommand[] {
        return Array.from(this._commandMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    /** 获取全部指令名（按名称升序）
     * @returns 指令名列表
     */
    public getCommandNames(): string[] {
        return Array.from(this._commandMap.keys()).sort((a, b) => a.localeCompare(b));
    }

    /** 模糊检索指令，用于输入提示
     * 采用子序列匹配，例如输入 rg 可命中 reset_game / reset_gm，并按匹配紧凑度排序
     * @param input 已输入的关键字
     * @param limit 最大返回条数
     * @returns 匹配的指令定义列表（越靠前匹配度越高）
     */
    public matchCommands(input: string, limit: number = ConsoleMgr.MAX_MATCH_COUNT): IConsoleCommand[] {
        const key = (input || "").trim().toLowerCase();
        const list = this.getCommands();
        if (!key) {
            return list.slice(0, limit);
        }

        const matched: Array<{ command: IConsoleCommand, score: number }> = [];
        for (const command of list) {
            const score = this._fuzzyScore(command.name, key);
            if (score >= 0) {
                matched.push({ command, score });
            }
        }
        // 分数越小越靠前，同分时按指令名升序，保证每次输入后的顺序稳定
        matched.sort((a, b) => a.score - b.score || a.command.name.localeCompare(b.command.name));
        return matched.slice(0, limit).map((item) => item.command);
    }

    /** 计算指令名与关键字的模糊匹配分数
     * 关键字字符按顺序出现在指令名中即视为匹配，跳过的字符越少、连续匹配越多分数越低
     * @param name 指令名（小写）
     * @param key 关键字（小写）
     * @returns 匹配分数，不匹配时返回 -1
     */
    private _fuzzyScore(name: string, key: string): number {
        // 以基数起步，保证优惠分抵扣后结果仍为正数（负数被约定为不匹配）
        let score = ConsoleMgr.FUZZY_SCORE_BASE;
        // 指令名以关键字开头时优先级最高
        if (name.indexOf(key) === 0) {
            score -= ConsoleMgr.FUZZY_SCORE_BASE / 2;
        }

        let from = 0;
        let lastPos = -1;
        for (const char of key) {
            const pos = name.indexOf(char, from);
            if (pos < 0) {
                return -1;
            }
            // 跳过的字符越多分数越高
            score += pos - lastPos - 1;
            // 与上一个字符相邻时给予优惠，让连续匹配排在前面
            if (lastPos >= 0 && pos === lastPos + 1) {
                score -= 2;
            }
            lastPos = pos;
            from = pos + 1;
        }
        return score;
    }

    /** 生成指令用法说明
     * @param command 指令定义
     * @returns 用法文本
     */
    public buildUsage(command: IConsoleCommand): string {
        if (command.usage) {
            return `${command.name} ${command.usage}`;
        }
        const params = command.params ?? [];
        if (params.length === 0) {
            return command.name;
        }
        const text = params.map((param) => (param.optional ? `[${param.name}]` : `<${param.name}>`)).join(" ");
        return `${command.name} ${text}`;
    }

    /****************  指令执行  ****************/

    /** 执行一条控制台输入
     * @param input 用户输入，形如 `addGold 100`
     * @returns 是否成功匹配到指令并执行
     */
    public exec(input: string): boolean {
        const raw = (input ?? "").trim();
        if (!raw) {
            return false;
        }
        if (!this._enabled) {
            this.log(`控制台已禁用，无法执行：${raw}`, EConsoleLogLevel.System);
            return false;
        }

        const tokens = this._splitTokens(raw);
        const name = (tokens.shift() ?? "").toLowerCase();
        this._pushHistory(raw);
        this.log(`$ ${raw}`, EConsoleLogLevel.Command);

        const command = this._commandMap.get(name);
        if (!command) {
            this.log(`未找到指令：${name}，输入 help 查看可用指令`, EConsoleLogLevel.Error);
            return false;
        }

        // 补齐缺省值并校验必填参数
        const args = this._resolveArgs(command, tokens);
        if (!args) {
            this.log(`参数不足，用法：${this.buildUsage(command)}`, EConsoleLogLevel.Error);
            return false;
        }

        try {
            const result = command.handler(args, raw);
            if (typeof result === "string" && result.length > 0) {
                this.log(result, EConsoleLogLevel.Command);
            }
        } catch (error) {
            this.log(`指令执行异常：${this._stringify(error)}`, EConsoleLogLevel.Error);
            console.error(`控制台指令执行异常：${name}`, error);
        }
        return true;
    }

    /** 按参数定义补齐缺省值并校验必填项
     * @param command 指令定义
     * @param tokens 解析出的参数
     * @returns 补齐后的参数列表，必填项缺失时返回 null
     */
    private _resolveArgs(command: IConsoleCommand, tokens: string[]): string[] | null {
        const params = command.params ?? [];
        // 未声明参数的指令不做校验，原样透传
        if (params.length === 0) {
            return tokens;
        }
        const args: string[] = [];
        for (let i = 0; i < params.length; i++) {
            const param = params[i];
            let value = tokens[i];
            if (value === undefined || value === "") {
                value = param.defaultValue ?? "";
            }
            if (!value && !param.optional) {
                return null;
            }
            args.push(value);
        }
        // 最后一个参数声明为 rest（名称以 ... 开头）时接收剩余全部内容
        const last = params[params.length - 1];
        if (last && last.name.indexOf("...") === 0 && tokens.length > params.length) {
            args[args.length - 1] = tokens.slice(params.length - 1).join(" ");
        }
        return args;
    }

    /** 切分输入为 token，支持双引号包裹含空格的参数
     * @param input 用户输入
     * @returns token 列表
     */
    private _splitTokens(input: string): string[] {
        const tokens: string[] = [];
        let current = "";
        let quoted = false;
        for (let i = 0; i < input.length; i++) {
            const char = input[i];
            if (char === `"`) {
                quoted = !quoted;
                continue;
            }
            if (!quoted && (char === " " || char === "\t")) {
                if (current) {
                    tokens.push(current);
                    current = "";
                }
                continue;
            }
            current += char;
        }
        if (current) {
            tokens.push(current);
        }
        return tokens;
    }

    /****************  日志  ****************/

    /** 输出一条日志
     * @param text 日志内容
     * @param level 日志级别
     */
    public log(text: string, level: EConsoleLogLevel = EConsoleLogLevel.Log): void {
        const item: IConsoleLogItem = { level, text: text ?? "", time: Date.now() };
        this._logList.push(item);
        if (this._logList.length > this._maxLogCount) {
            this._logList.splice(0, this._logList.length - this._maxLogCount);
        }
        this._view?.onLogChanged();
    }

    /** 输出普通日志
     * @param text 日志内容
     */
    public info(text: string): void {
        this.log(text, EConsoleLogLevel.Log);
    }

    /** 输出警告日志
     * @param text 日志内容
     */
    public warn(text: string): void {
        this.log(text, EConsoleLogLevel.Warn);
    }

    /** 输出错误日志
     * @param text 日志内容
     */
    public error(text: string): void {
        this.log(text, EConsoleLogLevel.Error);
    }

    /** 获取全部日志
     * @returns 日志列表
     */
    public getLogs(): IConsoleLogItem[] {
        return this._logList;
    }

    /** 清空全部日志 */
    public clearLogs(): void {
        this._logList.length = 0;
        this._view?.onLogChanged();
    }

    /** 日志最大保留条数 */
    public get maxLogCount(): number {
        return this._maxLogCount;
    }

    /****************  历史指令  ****************/

    /** 获取历史指令（最新的在最后）
     * @returns 历史指令列表
     */
    public getHistory(): string[] {
        return this._historyList;
    }

    /** 清空历史指令 */
    public clearHistory(): void {
        this._historyList.length = 0;
    }

    /** 写入一条历史指令（去重后追加，超出上限丢弃最早的）
     * @param input 用户输入
     */
    private _pushHistory(input: string): void {
        const last = this._historyList[this._historyList.length - 1];
        if (last === input) {
            return;
        }
        this._historyList.push(input);
        if (this._historyList.length > this._maxHistoryCount) {
            this._historyList.splice(0, this._historyList.length - this._maxHistoryCount);
        }
    }

    /****************  视图与开关  ****************/

    /** 绑定视图实例，由 `GCoreConsoleView` 在加载时调用
     * @param view 视图实例，传 null 解绑
     */
    public setView(view: IConsoleView | null): void {
        this._view = view;
    }

    /** 获取当前绑定的视图 */
    public getView(): IConsoleView | null {
        return this._view;
    }

    /** 显示控制台 */
    public show(): void {
        this._view?.setVisible(true);
    }

    /** 隐藏控制台 */
    public hide(): void {
        this._view?.setVisible(false);
    }

    /** 切换控制台显隐 */
    public toggle(): void {
        if (this._view?.isVisible()) {
            this.hide();
        } else {
            this.show();
        }
    }

    /** 控制台是否可见 */
    public isVisible(): boolean {
        return this._view?.isVisible() ?? false;
    }

    /** 设置是否允许执行指令（禁用后仍可查看日志）
     * @param enabled 是否启用
     */
    public setEnabled(enabled: boolean): void {
        this._enabled = enabled;
    }

    /** 是否允许执行指令 */
    public isEnabled(): boolean {
        return this._enabled;
    }

    /****************  console 接管  ****************/

    /** 设置是否接管 console 的输出同步到控制台
     * @param capture 是否接管
     */
    public setCaptureConsole(capture: boolean): void {
        if (capture) {
            if (this._originLog) {
                return;
            }
            this._originLog = console.log.bind(console);
            this._originWarn = console.warn.bind(console);
            this._originError = console.error.bind(console);
            console.log = (...args: any[]) => {
                this._originLog?.(...args);
                this._capture(args, EConsoleLogLevel.Log);
            };
            console.warn = (...args: any[]) => {
                this._originWarn?.(...args);
                this._capture(args, EConsoleLogLevel.Warn);
            };
            console.error = (...args: any[]) => {
                this._originError?.(...args);
                this._capture(args, EConsoleLogLevel.Error);
            };
        } else {
            if (!this._originLog) {
                return;
            }
            console.log = this._originLog;
            console.warn = this._originWarn!;
            console.error = this._originError!;
            this._originLog = null;
            this._originWarn = null;
            this._originError = null;
        }
    }

    /** 是否接管了 console 输出 */
    public isCaptureConsole(): boolean {
        return !!this._originLog;
    }

    /** 将 console 输出同步为控制台日志
     * @param args console 原始参数
     * @param level 日志级别
     */
    private _capture(args: any[], level: EConsoleLogLevel): void {
        // 控制台自身的日志不再回灌，避免无限递归
        if (this._capturing) {
            return;
        }
        this._capturing = true;
        try {
            const text = args.map((arg) => this._stringify(arg)).join(" ");
            if (text) {
                this.log(text, level);
            }
        } finally {
            this._capturing = false;
        }
    }

    /** 将任意值转为可读文本
     * @param value 任意值
     * @returns 文本
     */
    private _stringify(value: any): string {
        if (typeof value === "string") {
            return value;
        }
        if (value instanceof Error) {
            return value.message || value.name;
        }
        try {
            return JSON.stringify(value) ?? String(value);
        } catch (error) {
            return String(value);
        }
    }

    /****************  内置指令  ****************/

    /** 注册内置指令：help / clear / echo / history */
    private _registerBuiltinCommands(): void {
        this.registerAll([
            {
                name: "help",
                desc: "查看指令列表或单条指令用法",
                params: [{ name: "指令名", optional: true }],
                group: ConsoleMgr.BUILTIN_GROUP,
                handler: (args) => this._onHelp(args[0]),
            },
            {
                name: "clear",
                desc: "清空控制台日志",
                group: ConsoleMgr.BUILTIN_GROUP,
                handler: () => {
                    this.clearLogs();
                    return "已清空日志";
                },
            },
            {
                name: "cls",
                desc: "清空控制台日志（clear 的别名）",
                group: ConsoleMgr.BUILTIN_GROUP,
                handler: () => {
                    this.clearLogs();
                    return "已清空日志";
                },
            },
            {
                name: "echo",
                desc: "原样输出参数",
                params: [{ name: "...文本" }],
                group: ConsoleMgr.BUILTIN_GROUP,
                handler: (args) => args[0] ?? "",
            },
            {
                name: "history",
                desc: "查看历史输入",
                group: ConsoleMgr.BUILTIN_GROUP,
                handler: () => {
                    const history = this.getHistory();
                    if (history.length === 0) {
                        return "暂无历史输入";
                    }
                    return history.map((item, index) => `${index + 1}. ${item}`).join("\n");
                },
            },
        ]);
    }

    /** help 指令实现
     * @param name 指定指令名，为空时列出全部
     * @returns 帮助文本
     */
    private _onHelp(name?: string): string {
        if (name) {
            const command = this.getCommand(name);
            if (!command) {
                return `未找到指令：${name}`;
            }
            const lines = [`用法：${this.buildUsage(command)}`];
            if (command.desc) {
                lines.push(`说明：${command.desc}`);
            }
            for (const param of command.params ?? []) {
                lines.push(`  ${param.optional ? "[" : "<"}${param.name}${param.optional ? "]" : ">"}  ${param.desc ?? ""}`);
            }
            return lines.join("\n");
        }

        const commands = this.getCommands();
        if (commands.length === 0) {
            return "暂无可用指令";
        }
        const groups = new Map<string, IConsoleCommand[]>();
        for (const command of commands) {
            const key = command.group ?? ConsoleMgr.BUILTIN_GROUP;
            const list = groups.get(key) ?? [];
            list.push(command);
            groups.set(key, list);
        }
        const lines: string[] = [`可用指令（共 ${commands.length} 条）：`];
        for (const [group, list] of groups) {
            lines.push(`[${group}]`);
            for (const command of list) {
                lines.push(`  ${command.name}  ${command.desc ?? ""}`);
            }
        }
        lines.push(`输入 help <指令名> 查看详细用法`);
        return lines.join("\n");
    }
}

// GCore 全局控制台管理器单例（定义于此，避免与 index.ts 桶文件形成循环依赖）
export const gcoreConsole = new ConsoleMgr();
