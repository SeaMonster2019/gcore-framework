/** 生成简单的雪花ID（兼容大多数用例的简易实现）
 * 说明：内部直接生成 number，字符串接口仅做一次 number 转字符串。
 * 注意：由于 JavaScript number 的精度限制，这里不保证 64 位整数完全精确。
 */
class SimpleSnowflake {
    private static readonly NODE_BITS = 10;
    private static readonly SEQUENCE_BITS = 12;
    private static readonly SEQUENCE_MASK = (1 << SimpleSnowflake.SEQUENCE_BITS) - 1;
    private static readonly NODE_MASK = (1 << SimpleSnowflake.NODE_BITS) - 1;
    private static readonly SEQUENCE_SCALE = 1 << SimpleSnowflake.SEQUENCE_BITS;
    private static readonly ID_SCALE = 1 << (SimpleSnowflake.NODE_BITS + SimpleSnowflake.SEQUENCE_BITS);

    private epoch = 1577836800000; // 2020-01-01T00:00:00.000Z
    private nodeId: number;
    private sequence = 0;
    private lastTimestamp = 0;

    constructor(nodeId = 1) {
        this.nodeId = (nodeId || 0) & SimpleSnowflake.NODE_MASK;
    }

    private timestamp(): number {
        return Date.now();
    }

    nextNumber(): number {
        let ts = this.timestamp();
        if (ts < this.lastTimestamp) {
            // 时钟回拨，简单处理：等待直到时间前进
            ts = this.lastTimestamp;
        }

        if (ts === this.lastTimestamp) {
            this.sequence = (this.sequence + 1) & SimpleSnowflake.SEQUENCE_MASK;
            if (this.sequence === 0) {
                // 序列溢出，等待下一毫秒
                while (ts <= this.lastTimestamp) {
                    ts = this.timestamp();
                }
            }
        } else {
            this.sequence = 0;
        }

        this.lastTimestamp = ts;

        const diff = ts - this.epoch;
        return diff * SimpleSnowflake.ID_SCALE + this.nodeId * SimpleSnowflake.SEQUENCE_SCALE + this.sequence;
    }

    next(): string {
        return this.nextNumber().toString();
    }
}

// 单例生成器，默认节点 ID 为 1
const _snowflake = new SimpleSnowflake(1);

/** 生成 number 类型的雪花数（注意：JavaScript number 为 IEEE-754 双精度，超过 2^53-1 的整数会丢失精度）
 * @returns {number} 雪花数的 number 表示
 */
export function SnowflakeIdNumber(): number {
    return _snowflake.nextNumber();
}

/** 生成雪花数 */
export function SnowflakeId(): string {
    return _snowflake.next();
}

