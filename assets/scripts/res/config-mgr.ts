/** 存储系统 */
export class ConfigMgr {

    /** 游戏存档key */
    private static readonly GAME_CONFIG_KEY = "GAME_CONFIG_KEY";

    /** 初始化 */
    async init(): Promise<boolean> {

        return true;
    }

    /** 获取游戏配置 */
    getGameConfig<T>(): T | undefined {
        const config = localStorage.getItem(ConfigMgr.GAME_CONFIG_KEY);
        return config ? JSON.parse(config) as T : undefined;
    }

    /** 保存游戏配置 */
    saveGameConfig<T>(config: T): void {
        localStorage.setItem(ConfigMgr.GAME_CONFIG_KEY, JSON.stringify(config));
    }

}


