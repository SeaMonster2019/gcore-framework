# MVC 模块使用说明

## 概述

MVC 模块是 GCore 框架的核心 UI 架构，基于经典的 **Model-View-Controller** 模式设计，用于管理游戏中的界面生命周期、数据与逻辑的分离。通过 `MvcMgr` 管理器统一注册、打开、关闭视图，实现界面的规范化管理。

## 模块结构

```
mvc/
├── base-model.ts      # 数据层基类 BaseModel
├── base-view.ts       # 视图层基类 BaseView
├── base-ctrl.ts       # 控制层基类 BaseCtrl
├── mvc-interface.ts   # 接口与类型定义
├── mvc-mgr.ts         # MVC 管理器 MvcMgr
└── README.md          # 本说明文档
```

## 核心类说明

### BaseModel — 数据层基类

负责存储界面相关的数据状态。

| 属性/方法 | 说明 |
|-----------|------|
| `tid` | 类型 id（只读） |
| `onInit()` | 初始化生命周期回调 |
| `onDestroy()` | 销毁生命周期回调 |

### BaseView — 视图层基类

继承自 `UiComp`，负责界面展示与用户交互。

| 属性/方法 | 说明 |
|-----------|------|
| `_ctrl` | 关联的控制器实例 |
| `_model` | 关联的数据模型实例 |
| `_params` | 视图参数（泛型） |
| `close` | 关闭当前视图的方法 |
| `onInit(tid, iid, ctrl, model, params)` | 初始化视图，由框架自动调用 |
| `onOpen()` | 视图打开回调 |
| `onRefresh()` | 视图刷新回调（复用已有实例时触发） |
| `onBtnClose()` | 关闭按钮点击事件（protected） |
| `getTid()` | 获取类型 id |
| `getIid()` | 获取实例 id |

### BaseCtrl — 控制层基类

负责界面业务逻辑，协调 Model 与 View。

| 属性/方法 | 说明 |
|-----------|------|
| `tid` | 类型 id（只读） |
| `data` | 关联的数据模型（只读） |
| `onInit()` | 初始化生命周期回调 |
| `onDestroy()` | 销毁生命周期回调 |

### MvcMgr — MVC 管理器

负责 MVC 模块的注册与视图的创建、销毁等核心管理，通过 `gcore.mvc` 访问。

| 方法 | 说明 |
|------|------|
| `init(params)` | 初始化管理器，传入根节点与预制体加载函数 |
| `register(params)` | 注册单个 MVC 模块 |
| `registerAll(params[], callback?)` | 批量注册 MVC 模块 |
| `open(tid, params?)` | 打开视图，返回 `IViewHandle` |
| `close(tid, destroy?, iid?)` | 关闭视图 |
| `closeAll(destroy, excludeTids?)` | 关闭所有视图 |
| `getView(tid, iid?)` | 获取视图实例 |
| `getViews(tid)` | 获取所有同类型视图实例 |
| `getModel(type)` | 获取数据模型（按 tid 或类名） |
| `getCtrl(type)` | 获取控制器（按 tid 或类名） |

## 关键接口

### IMvcParams — MVC 注册参数

```typescript
interface IMvcParams {
    tid: number;           // 类型 id（唯一标识）
    prefabName: string;    // 预制体路径
    packName: string;      // 资源包名
    layer: number;         // 层级
    CtrlType: new (...args: any[]) => BaseCtrl;   // 控制器类
    ModelType: new (...args: any[]) => BaseModel;  // 数据模型类
    ViewType: new (...args: any[]) => ViewType;    // 视图类
    attribute: IViewAttribute;  // 视图属性配置
}
```

### IViewAttribute — 视图属性

```typescript
interface IViewAttribute {
    priority?: number;     // 优先度（同层级下越高越优先渲染）
    bIsOnly?: boolean;     // 是否唯一（仅允许一个实例）
    bResident?: boolean;   // 是否常驻（close 时隐藏而非销毁，常驻必须是唯一的）
    bIsdaptation?: boolean; // 是否适配屏幕
}
```

### IViewParams — 视图参数基类

```typescript
interface IViewParams {
    onClose?: () => void;  // 关闭回调（可选）
}
```

### IViewHandle — 视图句柄

```typescript
interface IViewHandle {
    readonly tid: number;           // 类型 id
    readonly iid: number;           // 实例 id
    close(destroy?: boolean): void; // 关闭当前视图实例
}
```

## 使用流程

### 1. 创建 MVC 三件套

以「主菜单」为例：

**Model** — 定义数据

```typescript
import { BaseModel } from "gcore";

export class MainMenuModel extends BaseModel {
    // 在此定义界面所需的数据字段
}
```

**View** — 定义视图

```typescript
import { _decorator } from "cc";
import { BaseView, IViewParams } from "gcore";
import { MainMenuCtrl } from "./main-menu-ctrl";
import { MainMenuModel } from "./main-menu-model";

const { ccclass } = _decorator;

// 定义视图参数接口，继承 IViewParams
export interface IMainMenuViewParams extends IViewParams {
    onNewGame: () => Promise<void>;
    onLoadGame: (slotKey: string) => Promise<void>;
    onExitGame: () => Promise<void>;
}

@ccclass('MainMenuView')
export class MainMenuView extends BaseView<IMainMenuViewParams> {

    // 声明关联的 ctrl 和 model 类型（用于类型提示）
    protected declare _ctrl: MainMenuCtrl;
    protected declare _model: MainMenuModel;

    /** 视图打开回调 */
    onOpen(): void {
        // 视图打开时的逻辑
    }

    /** 视图刷新回调（复用时触发） */
    onRefresh(): void {
        // 视图被刷新时的逻辑
    }
}
```

**Ctrl** — 定义控制器

```typescript
import { BaseCtrl, gcore } from "gcore";

export class MainMenuCtrl extends BaseCtrl {

    /** 初始化 */
    public onInit(): void {
        // 控制器初始化逻辑
    }

    /** 打开子界面示例 */
    public openSubMenu(): void {
        gcore.mvc.open(SubmenuView, { /* params */ });
    }
}
```

### 2. 定义模块枚举与配置

在业务工程中定义模块 id 枚举和注册参数列表：

```typescript
import { IMvcParams } from "gcore";

/** 面板类型枚举 */
export enum EModule {
    MainMenu = 1,
    Settings,
    // ...
}

/** 面板配置列表 */
export const UiDefine: IMvcParams[] = [
    {
        tid: EModule.MainMenu,
        packName: "main",
        prefabName: "module/MainMenu/MainMenuView",
        layer: 0,
        CtrlType: MainMenuCtrl,
        ModelType: MainMenuModel,
        ViewType: MainMenuView,
        attribute: {
            bIsOnly: true,       // 唯一实例
            bIsdaptation: true,  // 适配屏幕
        },
    },
    // 更多面板配置...
];
```

### 3. 注册 MVC 模块

在游戏启动流程中批量注册：

```typescript
import { gcore } from "gcore";

// 批量注册
gcore.mvc.registerAll(UiDefine);

// 或单个注册
gcore.mvc.register(UiDefine[0]);
```

### 4. 打开视图

```typescript
import { gcore } from "gcore";

// 打开视图（无必填参数时可省略）
const handle = await gcore.mvc.open(EModule.MainMenu, {
    onNewGame: async () => { /* ... */ },
    onLoadGame: async (key) => { /* ... */ },
    onExitGame: () => { /* ... */ },
});

// 通过句柄关闭
handle.close();
```

### 5. 关闭视图

```typescript
// 按类型 id 关闭
gcore.mvc.close(EModule.MainMenu);

// 关闭时销毁节点
gcore.mvc.close(EModule.MainMenu, true);

// 关闭所有视图（可排除指定模块）
gcore.mvc.closeAll(true, [EModule.MainMenu]);
```

### 6. 获取 Model / Ctrl

```typescript
// 按 tid 获取
const model = gcore.mvc.getModel<MainMenuModel>(EModule.MainMenu);
const ctrl = gcore.mvc.getCtrl<MainMenuCtrl>(EModule.MainMenu);

// 按类获取
const model = gcore.mvc.getModel(MainMenuModel);
const ctrl = gcore.mvc.getCtrl(MainMenuCtrl);
```

## 视图属性说明

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `priority` | number | - | 同层级下的渲染优先度，值越大越优先 |
| `bIsOnly` | boolean | false | 唯一实例，重复 open 时会复用已有实例并触发 `onRefresh` |
| `bResident` | boolean | false | 常驻节点，close 时仅隐藏不销毁（必须配合 `bIsOnly: true`） |
| `bIsdaptation` | boolean | false | 是否适配屏幕，开启后视图会自动适配可见区域大小 |

## 生命周期流程

```
register()
  ├── 创建 Model 实例 → Model.onInit()
  └── 创建 Ctrl 实例  → Ctrl.onInit()

open()
  ├── 检查是否已有实例（bIsOnly / bResident）
  │   └── 若有 → 显示节点 → View.onRefresh() → 返回句柄
  ├── 加载 Prefab → 实例化节点
  ├── View.onInit(tid, iid, ctrl, model, params)
  ├── View.onOpen()
  └── View.onRefresh()

close()
  ├── bResident → node.active = false（隐藏）
  └── 否则 → node.destroy()（销毁）
```

## 注意事项

1. **预制体绑定**：预制体根节点必须挂载对应的 `ViewType` 组件，否则会报错
2. **常驻视图**：`bResident` 必须配合 `bIsOnly: true` 使用，常驻视图 close 时仅隐藏
3. **视图参数泛型**：通过 `extends IViewParams` 扩展参数接口，框架会根据参数是否包含必填字段自动推断 `open` 时参数是否必传
4. **多实例**：不设置 `bIsOnly` 时允许同一视图打开多个实例，关闭时可通过 `iid` 指定关闭某个实例
5. **类型安全**：在 View 中使用 `declare` 关键字声明具体的 Ctrl 和 Model 类型，以获得完整的类型提示
