import { Vec2 } from "cc";

export class Line {
    public a: number;
    public b: number;

    public constructor(a: number, b: number) {
        this.a = a;
        this.b = b;
    }
}

export interface RectLike {
    x: number;
    y: number;
    width: number;
    height: number;
}

const BRIDSON_K = 30;
const TWO_PI = Math.PI * 2;
const EPSILON = 1e-6;

/** 泊松盘采样工具 */
export class PoissonDisk {

    /** 泊松盘采样（Bridson 算法），矩形区域 */
    public static PoissonDiskSampling(rect: RectLike, minDistance: number): Vec2[];
    /** 泊松盘采样（Bridson 算法），矩形区域，最多返回 numberOfPoints 个 */
    public static PoissonDiskSampling(rect: RectLike, numberOfPoints: number, minDistance: number): Vec2[];
    /** 泊松盘采样（四条线围成的区域），最多返回 numberOfPoints 个 */
    public static PoissonDiskSampling(lines: Line[], numberOfPoints: number, minDistance: number): Vec2[];
    public static PoissonDiskSampling(target: RectLike | Line[], arg2: number, arg3?: number): Vec2[] {
        if (Array.isArray(target)) {
            if (typeof arg3 !== "number") {
                return [];
            }
            return this.poissonDiskSamplingLines(target, arg2, arg3);
        }

        if (typeof arg3 === "number") {
            return this.takeRandomSubset(this.poissonDiskSamplingRect(target, arg3), arg2);
        }

        return this.poissonDiskSamplingRect(target, arg2);
    }

    private static poissonDiskSamplingRect(rect: RectLike, minDistance: number): Vec2[] {
        return this.poissonDiskSamplingBridson(rect.x, rect.y, rect.width, rect.height, minDistance, undefined);
    }

    private static poissonDiskSamplingLines(lines: Line[], numberOfPoints: number, minDistance: number): Vec2[] {
        const polygon = this.tryGetPolygonVertices(lines);
        if (polygon === null) {
            return [];
        }

        const bounds = this.getPolygonBounds(polygon);
        const points = this.poissonDiskSamplingBridson(bounds.x, bounds.y, bounds.width, bounds.height, minDistance, (point) => this.isPointInPolygon(point, polygon));

        if (points.length > numberOfPoints) {
            return this.takeRandomSubset(points, numberOfPoints);
        }

        return points;
    }

    private static poissonDiskSamplingBridson(originX: number, originY: number, width: number, height: number, minDistance: number, inRegion?: (point: Vec2) => boolean): Vec2[] {
        const points: Vec2[] = [];
        if (width <= 0 || height <= 0 || minDistance <= 0) {
            return points;
        }

        const cellSize = minDistance / Math.SQRT2;
        const cols = Math.max(1, Math.ceil(width / cellSize));
        const rows = Math.max(1, Math.ceil(height / cellSize));
        const grid = new Array<number>(cols * rows);
        grid.fill(-1);

        const random = Math.random;
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

    private static setGrid(grid: number[], cols: number, rows: number, cellSize: number, ox: number, oy: number, point: Vec2, pointIndex: number): void {
        const col = Math.max(0, Math.min(cols - 1, Math.floor((point.x - ox) / cellSize)));
        const row = Math.max(0, Math.min(rows - 1, Math.floor((point.y - oy) / cellSize)));
        grid[row * cols + col] = pointIndex;
    }

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

    private static getLineIntersection(line1: Line, line2: Line): Vec2 | null {
        const deltaA = line1.a - line2.a;
        if (Math.abs(deltaA) < EPSILON) {
            return null;
        }

        const x = (line2.b - line1.b) / deltaA;
        return new Vec2(x, line1.a * x + line1.b);
    }

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