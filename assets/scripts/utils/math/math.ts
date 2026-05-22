import { Vec2 } from "cc";

/** 线性方程 y = ax + b */
export class Line {
    /** 斜率 */
    public a: number;
    /** 截距 */
    public b: number;

    /** 创建一条线性方程
     * @param a 斜率
     * @param b 截距
     */
    public constructor(a: number, b: number) {
        this.a = a;
        this.b = b;
    }
}

/** 矩形区域数据 */
export interface RectLike {
    /** 左下角 x 坐标 */
    x: number;
    /** 左下角 y 坐标 */
    y: number;
    /** 宽度 */
    width: number;
    /** 高度 */
    height: number;
}

/** Bridson 算法的单点邻域尝试次数 */
const BRIDSON_K = 30;
/** 圆周率的两倍 */
const TWO_PI = Math.PI * 2;
/** 浮点比较容差 */
const EPSILON = 1e-6;

/** 泊松盘采样工具 */
export class PoissonDisk {

    /****************  对外采样入口  ****************/

    /** 泊松盘采样（Bridson 算法），矩形区域 */
    public static PoissonDiskSampling(random: () => number, rect: RectLike, minDistance: number): Vec2[];
    /** 泊松盘采样（Bridson 算法），矩形区域，最多返回 numberOfPoints 个 */
    public static PoissonDiskSampling(random: () => number, rect: RectLike, numberOfPoints: number, minDistance: number): Vec2[];
    /** 泊松盘采样（四条线围成的区域），最多返回 numberOfPoints 个 */
    public static PoissonDiskSampling(random: () => number, lines: Line[], numberOfPoints: number, minDistance: number): Vec2[];
    public static PoissonDiskSampling(random: () => number, target: RectLike | Line[], arg3: number, arg4?: number): Vec2[] {
        if (Array.isArray(target)) {
            if (typeof arg4 !== "number") {
                return [];
            }
            return this.poissonDiskSamplingLines(random, target, arg3, arg4);
        }

        if (typeof arg4 === "number") {
            return this.takeRandomSubset(this.poissonDiskSamplingRect(random, target, arg4), arg3);
        }

        return this.poissonDiskSamplingRect(random, target, arg3);
    }

    /** 矩形区域高密度泊松盘采样，内部自动估算点数上限并尽量多生成点
     * @param rect 矩形区域
     * @param minDistance 点之间的最小距离
     * @returns 采样得到的点集合
     */
    public static PoissonDiskSamplingDense(random: () => number, rect: RectLike, minDistance: number): Vec2[] {
        const numberOfPoints = this.estimateRectPointCount(rect, minDistance);
        let bestPoints: Vec2[] = [];
        const retryCount = Math.max(2, Math.min(6, Math.ceil(numberOfPoints / 64)));

        for (let i = 0; i < retryCount; i++) {
            const points = this.PoissonDiskSampling(random, rect, numberOfPoints, minDistance);
            if (points.length > bestPoints.length) {
                bestPoints = points;
            }

            if (bestPoints.length >= numberOfPoints) {
                break;
            }
        }

        return bestPoints;
    }

    /****************  矩形与多边形采样  ****************/

    /** 在矩形区域内执行泊松盘采样
     * @param rect 矩形区域
     * @param minDistance 点之间的最小距离
     * @returns 采样得到的点集合
     */
    private static poissonDiskSamplingRect(random: () => number, rect: RectLike, minDistance: number): Vec2[] {
        return this.poissonDiskSamplingBridson(random, rect.x, rect.y, rect.width, rect.height, minDistance, undefined);
    }

    /** 估算矩形区域内可容纳的点数上限
     * @param rect 矩形区域
     * @param minDistance 点之间的最小距离
     * @returns 估算得到的点数上限
     */
    private static estimateRectPointCount(rect: RectLike, minDistance: number): number {
        if (rect.width <= 0 || rect.height <= 0 || minDistance <= 0) {
            return 0;
        }

        const area = rect.width * rect.height;
        const theoreticalMax = area * 2 / (Math.sqrt(3) * minDistance * minDistance);
        return Math.max(1, Math.ceil(theoreticalMax));
    }

    /** 在四条线围成的区域内执行泊松盘采样
     * @param lines 组成边界的四条直线
     * @param numberOfPoints 最多返回的点数
     * @param minDistance 点之间的最小距离
     * @returns 采样得到的点集合
     */
    private static poissonDiskSamplingLines(random: () => number, lines: Line[], numberOfPoints: number, minDistance: number): Vec2[] {
        const polygon = this.tryGetPolygonVertices(lines);
        if (polygon === null) {
            return [];
        }

        const bounds = this.getPolygonBounds(polygon);
        const points = this.poissonDiskSamplingBridson(random, bounds.x, bounds.y, bounds.width, bounds.height, minDistance, (point) => this.isPointInPolygon(point, polygon));

        if (points.length > numberOfPoints) {
            return this.takeRandomSubset(points, numberOfPoints);
        }

        return points;
    }

    /****************  Bridson 核心采样  ****************/

    /** 执行 Bridson 泊松盘采样
     * @param originX 区域起点 x
     * @param originY 区域起点 y
     * @param width 区域宽度
     * @param height 区域高度
     * @param minDistance 点之间的最小距离
     * @param inRegion 可选的区域判定函数
     * @returns 采样得到的点集合
     */
    private static poissonDiskSamplingBridson(random: () => number, originX: number, originY: number, width: number, height: number, minDistance: number, inRegion?: (point: Vec2) => boolean): Vec2[] {
        const points: Vec2[] = [];
        if (width <= 0 || height <= 0 || minDistance <= 0) {
            return points;
        }

        const cellSize = minDistance / Math.SQRT2;
        const cols = Math.max(1, Math.ceil(width / cellSize));
        const rows = Math.max(1, Math.ceil(height / cellSize));
        const grid = new Array<number>(cols * rows);
        grid.fill(-1);

        const minDistanceSq = minDistance * minDistance;
        const active: number[] = [];

        let firstPoint: Vec2 | null = null;
        let attempts = 1000;
        while (attempts-- > 0) {
            const candidate = new Vec2(originX + random() * width, originY + random() * height);
            if (inRegion === undefined || inRegion(candidate)) {
                firstPoint = candidate;
                break;
            }
        }

        if (firstPoint === null) {
            return points;
        }

        points.push(firstPoint);
        active.push(0);
        this.setGrid(grid, cols, rows, cellSize, originX, originY, firstPoint, 0);

        while (active.length > 0) {
            const activeIndex = (random() * active.length) | 0;
            const pointIndex = active[activeIndex];
            const point = points[pointIndex];
            let found = false;

            for (let i = 0; i < BRIDSON_K; i++) {
                const angle = random() * TWO_PI;
                const radius = minDistance * (1 + random());
                const candidateX = point.x + radius * Math.cos(angle);
                const candidateY = point.y + radius * Math.sin(angle);

                if (candidateX < originX || candidateX >= originX + width || candidateY < originY || candidateY >= originY + height) {
                    continue;
                }

                const candidate = new Vec2(candidateX, candidateY);
                if (inRegion !== undefined && !inRegion(candidate)) {
                    continue;
                }

                if (this.hasNeighborInRange(grid, cols, rows, cellSize, originX, originY, candidate, minDistanceSq, points)) {
                    continue;
                }

                points.push(candidate);
                active.push(points.length - 1);
                this.setGrid(grid, cols, rows, cellSize, originX, originY, candidate, points.length - 1);
                found = true;
                break;
            }

            if (!found) {
                const lastIndex = active.length - 1;
                active[activeIndex] = active[lastIndex];
                active.length = lastIndex;
            }
        }

        return points;
    }

    /** 将点写入空间网格
     * @param grid 空间网格
     * @param cols 列数
     * @param rows 行数
     * @param cellSize 单元格大小
     * @param ox 区域原点 x
     * @param oy 区域原点 y
     * @param point 当前点
     * @param pointIndex 当前点索引
     */
    private static setGrid(grid: number[], cols: number, rows: number, cellSize: number, ox: number, oy: number, point: Vec2, pointIndex: number): void {
        const col = Math.max(0, Math.min(cols - 1, Math.floor((point.x - ox) / cellSize)));
        const row = Math.max(0, Math.min(rows - 1, Math.floor((point.y - oy) / cellSize)));
        grid[row * cols + col] = pointIndex;
    }

    /** 判断指定点周围是否存在距离过近的邻居
     * @param grid 空间网格
     * @param cols 列数
     * @param rows 行数
     * @param cellSize 单元格大小
     * @param ox 区域原点 x
     * @param oy 区域原点 y
     * @param point 待检测点
     * @param minDistanceSq 最小距离平方
     * @param points 已采样点集合
     * @returns 是否存在邻近点
     */
    private static hasNeighborInRange(grid: number[], cols: number, rows: number, cellSize: number, ox: number, oy: number, point: Vec2, minDistanceSq: number, points: Vec2[]): boolean {
        const cellCol = Math.floor((point.x - ox) / cellSize);
        const cellRow = Math.floor((point.y - oy) / cellSize);
        const radius = Math.ceil(Math.SQRT2) + 1;

        for (let dc = -radius; dc <= radius; dc++) {
            const col = cellCol + dc;
            if (col < 0 || col >= cols) {
                continue;
            }

            for (let dr = -radius; dr <= radius; dr++) {
                const row = cellRow + dr;
                if (row < 0 || row >= rows) {
                    continue;
                }

                const pointIndex = grid[row * cols + col];
                if (pointIndex < 0) {
                    continue;
                }

                const neighbor = points[pointIndex];
                const dx = point.x - neighbor.x;
                const dy = point.y - neighbor.y;
                if (dx * dx + dy * dy < minDistanceSq) {
                    return true;
                }
            }
        }

        return false;
    }

    /****************  多边形与几何辅助  ****************/

    /** 计算两条直线的交点
     * @param line1 第一条直线
     * @param line2 第二条直线
     * @returns 交点，若平行则返回空
     */
    private static getLineIntersection(line1: Line, line2: Line): Vec2 | null {
        const deltaA = line1.a - line2.a;
        if (Math.abs(deltaA) < EPSILON) {
            return null;
        }

        const x = (line2.b - line1.b) / deltaA;
        return new Vec2(x, line1.a * x + line1.b);
    }

    /** 尝试从四条直线中解析出多边形顶点
     * @param lines 边界直线
     * @returns 顶点数组，解析失败则返回空
     */
    private static tryGetPolygonVertices(lines: Line[]): Vec2[] | null {
        if (lines.length !== 4) {
            return null;
        }

        const intersections: Vec2[] = [];
        for (let i = 0; i < 4; i++) {
            for (let j = i + 1; j < 4; j++) {
                const intersection = this.getLineIntersection(lines[i], lines[j]);
                if (intersection !== null) {
                    intersections.push(intersection);
                }
            }
        }

        if (intersections.length < 4) {
            return null;
        }

        this.sortVerticesByAngle(intersections);
        return intersections;
    }

    /** 按角度对顶点进行排序
     * @param points 待排序顶点
     */
    private static sortVerticesByAngle(points: Vec2[]): void {
        if (points.length === 0) {
            return;
        }

        let centerX = 0;
        let centerY = 0;
        for (let i = 0; i < points.length; i++) {
            centerX += points[i].x;
            centerY += points[i].y;
        }

        const invCount = 1 / points.length;
        centerX *= invCount;
        centerY *= invCount;

        points.sort((a, b) => {
            const angleA = Math.atan2(a.y - centerY, a.x - centerX);
            const angleB = Math.atan2(b.y - centerY, b.x - centerX);
            return angleA - angleB;
        });
    }

    /** 判断点是否位于多边形内部
     * @param point 待判断点
     * @param polygon 多边形顶点集合
     * @returns 是否在多边形内部
     */
    private static isPointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
        const count = polygon.length;
        if (count < 3) {
            return false;
        }

        let inside = false;
        for (let i = 0, j = count - 1; i < count; j = i++) {
            const current = polygon[i];
            const previous = polygon[j];
            if (((current.y > point.y) !== (previous.y > point.y)) &&
                (point.x < (previous.x - current.x) * (point.y - current.y) / (previous.y - current.y) + current.x)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /** 计算多边形包围盒
     * @param polygon 多边形顶点集合
     * @returns 包围盒数据
     */
    private static getPolygonBounds(polygon: Vec2[]): RectLike {
        if (polygon.length === 0) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;

        for (let i = 0; i < polygon.length; i++) {
            const point = polygon[i];
            if (point.x < minX) {
                minX = point.x;
            }
            if (point.y < minY) {
                minY = point.y;
            }
            if (point.x > maxX) {
                maxX = point.x;
            }
            if (point.y > maxY) {
                maxY = point.y;
            }
        }

        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    /** 从点集合中随机截取指定数量的点
     * @param points 原始点集合
     * @param numberOfPoints 目标数量
     * @returns 截取后的点集合
     */
    private static takeRandomSubset(points: Vec2[], numberOfPoints: number): Vec2[] {
        if (numberOfPoints <= 0) {
            points.length = 0;
            return points;
        }

        if (points.length <= numberOfPoints) {
            return points;
        }

        const random = Math.random;
        for (let i = 0; i < numberOfPoints; i++) {
            const j = i + ((random() * (points.length - i)) | 0);
            const temp = points[i];
            points[i] = points[j];
            points[j] = temp;
        }

        points.length = numberOfPoints;
        return points;
    }
}