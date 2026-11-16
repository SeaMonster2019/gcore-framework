/**
 * @file csv-util.ts
 * @description 标准 CSV 解析工具，支持双引号包裹字段内的换行、逗号与双写引号转义
 */

/**
 * 解析 CSV 文本内容为二维行字段数组
 * @param content CSV 文件文本
 * @returns 每行字段数组
 */
export function parseCsvRows(content: string): string[][] {
    const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else if (ch === '\r') {
                if (text[i + 1] === '\n') i++;
                field += '\n';
            } else {
                field += ch;
            }
            continue;
        }

        if (ch === '"' && field === '') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += ch;
        }
    }

    if (row.length > 0 || field !== '') {
        row.push(field);
        rows.push(row);
    }
    return rows;
}
