# ResLoadMgr 资源生命周期策略说明

`ResLoadMgr` 支持三种 bundle 资源策略。策略以 bundle 为单位配置，但所有 Hot bundle 共用同一个 LRU 暂存区。

## 初始化

在初始化资源管理器时设置全局 Hot LRU 容量：

```ts
gcore.res.init({
    hotCacheCapacity: 50,
});
```

容量按资源数量计算，不按内存大小计算。容量为 `0` 时，Hot 资源在引用归零后会立即从暂存区淘汰，行为接近 Normal。

也可以运行时调整容量：

```ts
gcore.res.setHotCacheCapacity(80);
```

调整容量后，如果当前共享暂存区超过新容量，会立即从最久未使用的资源开始淘汰。

## 策略类型

### Core 核心资源

适用于整个游戏生命周期内常驻的资源，例如字体、logo、默认 UI 贴图、框架基础资源等。

核心资源包加载时，管理器会调用：

```ts
bundle.loadDir("")
```

并对返回的所有资源执行一次：

```ts
asset.addRef()
```

这次引用由资源管理器持有，用来保证核心资源不会被普通业务释放。业务调用 `releaseRes` 只会减少业务引用计数，不会释放核心常驻引用。

核心资源只有在业务层显式释放整个 bundle 时才会释放：

```ts
gcore.res.releaseBundle("core");
```

### Hot 热门资源

适用于经常重复出现、反复打开或关卡内高频复用的资源，例如关卡资源、场景资源、常用 UI 面板等。

所有 Hot bundle 共用一个 LRU 暂存区。热门资源在业务引用计数归零后不会立即释放，而是进入这个共享暂存区。最后一次引擎引用不会立刻 `decRef()`，而是由管理器继续持有，直到资源被 LRU 淘汰。

当共享暂存区超过容量时，最久未使用的零引用资源会被淘汰，并在淘汰时执行 `decRef()`。

### Normal 普通资源

适用于普通临时资源。

普通资源在业务引用计数归零时立即执行 `decRef()`，并从管理器记录中移除。

## 配置策略

可以在加载 bundle 前配置：

```ts
gcore.res.setBundlePolicy("core", EResBundlePolicy.Core);
await gcore.res.loadBundle("core");
```

也可以在 `loadBundle` 时直接传入策略：

```ts
await gcore.res.loadBundle("ui", EResBundlePolicy.Hot);
await gcore.res.loadBundle("temp", EResBundlePolicy.Normal);
```

`loadBundle` 不负责设置 LRU 容量，LRU 容量由 `init` 或 `setHotCacheCapacity` 统一设置。

未配置策略的 bundle 默认使用：

```ts
EResBundlePolicy.Normal
```

## 加载和释放资源

每次成功调用 `loadRes` 都会增加一次业务引用：

```ts
const prefab = await gcore.res.loadRes<Prefab>("views/HomeView", "ui");
```

每次成功调用 `loadRes` 都必须配对一次 `releaseRes`：

```ts
gcore.res.releaseRes("views/HomeView", "ui");
```

如果需要对已加载资源额外持有一次引用，可以调用：

```ts
gcore.res.retainRes("views/HomeView", "ui");
gcore.res.releaseRes("views/HomeView", "ui");
```

## 引用归零时的行为

普通资源：

1. 业务引用计数减一。
2. 调用 `asset.decRef()`。
3. 当业务引用计数为 `0` 时，从管理器中移除。

热门资源：

1. 如果业务引用计数大于 `1`，业务引用计数减一，并调用 `asset.decRef()`。
2. 如果业务引用计数等于 `1`，业务引用计数变为 `0`，但不调用 `asset.decRef()`。
3. 资源进入所有 Hot bundle 共用的 LRU 暂存区。
4. 当资源被 LRU 淘汰时，才调用 `asset.decRef()` 并从管理器中移除。

核心资源：

1. 业务引用计数减一。
2. 核心常驻引用继续保留。
3. 只有调用 `releaseBundle` 时才会释放核心常驻引用。

## 单独释放 bundle

调用：

```ts
gcore.res.releaseBundle("ui");
```

会清理：

1. 该 bundle 下正在被管理器记录的资源。
2. 共享 LRU 暂存区中属于该 bundle 的零引用资源。
3. Core bundle 的常驻引用。
4. `AssetManager` 中已加载的 bundle。

因为 Hot bundle 共用一个暂存区，所以释放单个 bundle 时只会从共享暂存区中移除该 bundle 的资源，不会影响其他 Hot bundle 的缓存资源。

## 手动清理 Hot 缓存

清理所有 Hot bundle 的共享暂存区：

```ts
gcore.res.clearHotCache();
```

只清理某个 bundle 在共享暂存区里的资源：

```ts
gcore.res.clearHotCache("ui");
```

## Sprite 便捷方法

`setSprite` 内部会调用 `loadRes<SpriteFrame>`，所以成功调用后也会增加一次业务引用：

```ts
await gcore.res.setSprite("icons/coin/spriteFrame", "ui", sprite);
gcore.res.releaseRes("icons/coin/spriteFrame", "ui");
```

`setSpriteFormAtlas` 管理的是图集资源引用，不是子 SpriteFrame：

```ts
await gcore.res.setSpriteFormAtlas("atlas/common", "coin", "ui", sprite);
gcore.res.releaseRes("atlas/common", "ui");
```

不要单独释放 `SpriteAtlas.getSpriteFrame` 返回的子帧。

## 调试辅助接口

```ts
gcore.res.getResRefCount("views/HomeView", "ui");
gcore.res.getHotCacheCapacity();
gcore.res.getHotCacheSize();
gcore.res.getHotCacheSizeByBundle("ui");
gcore.res.getBundlePolicy("ui");
```
