import { ResLoadMgr } from "./res-load-mgr";
import { ConfigMgr } from "./config-mgr";
export * from "./res-load-mgr";
export * from "./config-mgr";
export const gcoreRes = new ResLoadMgr();
export const gcoreConfig = new ConfigMgr();
