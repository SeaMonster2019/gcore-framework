import { glog } from "../log/glog";

/** 测试用例 */
interface IGDebugCase {
    /** 测试函数 */
    testFunc: Function;
    /** 测试函数名称 */
    propertyKey: string;
    /** 期望测试结果 */
    testResult?: any;
    /** 参数 */
    params?: any;
    /** 是否异步 */
    isAsync?: boolean;
}

/** 测试统计信息 */
interface IGDebugStats {
    /** 总测试数 */
    total: number;
    /** 通过测试数 */
    passed: number;
    /** 失败测试数 */
    failed: number;
    /** 错误测试数 */
    errors: number;
}

/** 测试类数据 */
interface IGDebugCaseData {
    /** 构造函数 */
    constructor: Function;
    /** 测试函数映射表 */
    testFuncMap: Map<string, IGDebugCase[]>;
    /** 出错时是否结束 */
    isErrorEnd?: boolean;
}

/** 测试用例基类 */
export abstract class GDebugCase {

    /** 测试函数映射表，按类名隔离 */
    private static _TestFuncMap: Map<string, IGDebugCaseData> = new Map();

    /** 测试用例装饰器
     * @param name 测试用例名称
     */
    static GCoreTestCase(name: string, isErrorEnd: boolean = false) {
        return function <T extends typeof GDebugCase>(target: T): void | T {
            const className = target.name;  // 使用实际类名
            GDebugCase._GetTestClassData(className, target.constructor).isErrorEnd = isErrorEnd;
            (globalThis as any)[name as string] = () => {
                const newCast: GDebugCase = new ((target as any))() as GDebugCase;
                newCast._testStart();
            };
            return target;
        };
    }

    /** 测试用例方法装饰器
     * @param testResult 期望的测试结果（可选）
     */
    static GCoreTestFunc(param?: any, isTest: boolean = true, testResult?: any) {
        return function (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor) {

            if (!isTest) {
                return;
            }

            GDebugCase._RegisterTestFunc(target, propertyKey, descriptor, param, testResult, false);

        } as PropertyDecorator;
    }

    /** 异步测试方法装饰器 */
    static GCoreTestAsyncFunc(params?: any, isTest: boolean = true, testResult?: any) {
        return function (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor) {

            if (!isTest) {
                return;
            }

            GDebugCase._RegisterTestFunc(target, propertyKey, descriptor, params, testResult, true);

        } as PropertyDecorator;
    }

    /** 深度比较两个值是否相等 */
    private static _DeepEqual(a: any, b: any): boolean {
        if (a === b) return true;
        if (a == null || b == null) return false;
        if (typeof a !== typeof b) return false;

        if (typeof a === 'object') {
            if (Array.isArray(a) !== Array.isArray(b)) return false;

            if (Array.isArray(a)) {
                if (a.length !== b.length) return false;
                for (let i = 0; i < a.length; i++) {
                    if (!GDebugCase._DeepEqual(a[i], b[i])) return false;
                }
                return true;
            }

            const keysA = Object.keys(a);
            const keysB = Object.keys(b);
            if (keysA.length !== keysB.length) return false;

            for (const key of keysA) {
                if (!keysB.includes(key)) return false;
                if (!GDebugCase._DeepEqual(a[key], b[key])) return false;
            }
            return true;
        }

        return false;
    }

    /** 获取或创建类的测试数据 */
    private static _GetTestClassData(className: string, constructor: Function): IGDebugCaseData {
        if (!GDebugCase._TestFuncMap.has(className)) {
            const newClassData: IGDebugCaseData = {
                constructor: constructor,
                testFuncMap: new Map(),
                isErrorEnd: false,
            };
            GDebugCase._TestFuncMap.set(className, newClassData);
        }
        return GDebugCase._TestFuncMap.get(className)!;
    }

    /** 注册测试方法的公共逻辑 */
    private static _RegisterTestFunc(
        target: any,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor | undefined,
        params: any,
        testResult: any,
        isAsync: boolean = false
    ): void {
        const className = target.constructor.name;
        const propertyKeyStr = String(propertyKey);
        const testFunc = descriptor?.value || target[propertyKey];
        if (testFunc && typeof testFunc === 'function') {
            const classData = GDebugCase._GetTestClassData(className, target.constructor);
            if (!classData.testFuncMap.has(propertyKeyStr)) {
                classData.testFuncMap.set(propertyKeyStr, []);
            }
            const testCase: IGDebugCase = {
                testFunc: testFunc,
                propertyKey: propertyKeyStr,
                params: params,
                testResult: testResult,
                isAsync: isAsync,
            };
            classData.testFuncMap.get(propertyKeyStr)!.push(testCase);
        }
    }

    /** 开始测试 */
    private async _testStart(): Promise<void> {

        const className = this.constructor.name;
        const classData = GDebugCase._TestFuncMap.get(className);

        if (!classData || classData.testFuncMap.size === 0) {
            console.warn(`类 ${className} 没有注册任何测试函数`);
            return;
        }

        // 收集所有测试用例
        const allTestCases: IGDebugCase[] = [];
        for (const testCases of classData.testFuncMap.values()) {
            allTestCases.push(...testCases);
        }

        console.log(`========== 开始测试 [${className}] ==========`);
        const stats: IGDebugStats = { total: allTestCases.length, passed: 0, failed: 0, errors: 0 };

        for (const testCase of allTestCases) {
            const testName = testCase.propertyKey;
            try {
                const result = testCase.isAsync
                    ? await testCase.testFunc.bind(this)()
                    : testCase.testFunc.bind(this)();

                if (testCase.testResult !== undefined && !GDebugCase._DeepEqual(result, testCase.testResult)) {
                    glog.debugFailure(`✗ ${testName} 失败 | 期望: ${JSON.stringify(testCase.testResult)} | 实际: ${JSON.stringify(result)}`);
                    stats.failed++;
                    if (classData.isErrorEnd) break;
                } else {
                    glog.debugSuccess(`✓ ${testName} 通过`);
                    stats.passed++;
                }
            } catch (error) {
                glog.error(`✗ ${testName} 异常: ${error}`);
                stats.errors++;
                if (classData.isErrorEnd) break;
            }
        }

        console.log(`========== 完成 [${className}] | 总计: ${stats.total} | 通过: ${stats.passed} | 失败: ${stats.failed} | 异常: ${stats.errors} ==========`);
        GDebugCase._TestFuncMap.delete(className);
    }

}