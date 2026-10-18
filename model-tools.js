// Shared local model algorithms 44e49a566943b842ed411b02e51fbe4ac733ed32c3d618197d91f0a81452efaf
const __comparison=(()=>{
// AA exposes major.minor, not patch or the full measurement configuration.
function indexVersion(value) {
    const match = value?.trim().match(/^v?(\d+)\.(\d+)$/i);
    return match ? `${Number(match[1])}.${Number(match[2])}` : null;
}
function comparisonBasis(models) {
    const versions = new Set(models.map(m => indexVersion(m.benchmarkVersion)));
    if (!models.length)
        return { compatible: false, version: null, reason: '没有候选模型' };
    if (versions.has(null))
        return { compatible: false, version: null, reason: '存在未知基准版本，能力分数仅供单独查看' };
    if (versions.size !== 1)
        return { compatible: false, version: null, reason: '基准版本不同，停止跨版本能力排序与图表' };
    return { compatible: true, version: [...versions][0], reason: '报告的指数版本一致；补丁、供应商与测量配置仍未确认' };
}
const capability = new Set(['intelligence', 'coding', 'agentic']);
function filterModels(models, options = {}) {
    const { query = '', creator, version, maxInput, maxOutput, minSpeed, minCoding, sort = 'intelligence', direction = 'desc' } = options;
    const valid = (v) => v !== null && Number.isFinite(v);
    const rows = models.filter(m => `${m.name} ${m.creator}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
        (!creator || m.creator === creator) && (!version || (version === 'unknown' ? !indexVersion(m.benchmarkVersion) : indexVersion(m.benchmarkVersion) === version)) &&
        (maxInput === undefined || (valid(m.inputPrice) && m.inputPrice <= maxInput)) &&
        (maxOutput === undefined || (valid(m.outputPrice) && m.outputPrice <= maxOutput)) &&
        (minSpeed === undefined || (valid(m.speed) && m.speed >= minSpeed)) &&
        (minCoding === undefined || (valid(m.coding) && m.coding >= minCoding)));
    const mixed = !comparisonBasis(rows).compatible;
    return rows.sort((a, b) => {
        // Ability ordering is only meaningful within a reported version group.
        if (capability.has(sort) && mixed) {
            const av = indexVersion(a.benchmarkVersion), bv = indexVersion(b.benchmarkVersion);
            if (av !== bv)
                return av === null ? 1 : bv === null ? -1 : av.localeCompare(bv, undefined, { numeric: true });
            if (av === null)
                return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
        }
        if (sort !== 'name') {
            const av = a[sort], bv = b[sort];
            if (!valid(av) || !valid(bv)) {
                if (valid(av) !== valid(bv))
                    return valid(av) ? -1 : 1;
            }
            else if (av !== bv)
                return (av - bv) * (direction === 'asc' ? 1 : -1);
        }
        return a.name.localeCompare(b.name) * (sort === 'name' && direction === 'desc' ? -1 : 1) || a.id.localeCompare(b.id);
    });
}

return {indexVersion,comparisonBasis,filterModels};})();
export const {indexVersion,comparisonBasis,filterModels}=__comparison;
const __chart=(()=>{const {comparisonBasis}=__comparison;
const DEFAULT_VALUE_MIN_SCORE = 25;
const valid = (n) => n !== null && Number.isFinite(n) && n >= 0;
const stable = (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
function chartCost(model, price, outputShare) {
    if (!Number.isFinite(outputShare) || outputShare < 0 || outputShare > 100)
        throw new Error('输出比例需为 0–100');
    if (price === 'input')
        return valid(model.inputPrice) ? model.inputPrice : null;
    if (price === 'output')
        return valid(model.outputPrice) ? model.outputPrice : null;
    if (outputShare === 0)
        return valid(model.inputPrice) ? model.inputPrice : null;
    if (outputShare === 100)
        return valid(model.outputPrice) ? model.outputPrice : null;
    if (!valid(model.inputPrice) || !valid(model.outputPrice))
        return null;
    const cost = model.inputPrice * (1 - outputShare / 100) + model.outputPrice * outputShare / 100;
    return Number.isFinite(cost) ? cost : null;
}
function chartAnalysis(models, options) {
    const valueMinScore = options.valueMinScore ?? DEFAULT_VALUE_MIN_SCORE;
    if (!Number.isFinite(valueMinScore) || valueMinScore < 0)
        throw new Error('性价比能力门槛无效');
    const basis = comparisonBasis(models);
    if (!basis.compatible)
        return { basis, points: [], strongest: [], bestValue: [], frontier: [], excluded: models.length, free: 0 };
    const scored = models.filter(m => valid(m[options.metric]));
    const maximum = scored.length ? Math.max(...scored.map(m => m[options.metric])) : null;
    const strongest = scored.filter(m => m[options.metric] === maximum).sort(stable);
    const points = scored.flatMap(model => {
        const cost = chartCost(model, options.price, options.outputShare);
        if (cost === null)
            return [];
        const score = model[options.metric];
        const ratio = cost > 0 ? score / cost : null;
        return [{ model, cost, score, value: ratio !== null && Number.isFinite(ratio) ? ratio : null }];
    }).sort((a, b) => a.cost - b.cost || b.score - a.score || stable(a.model, b.model));
    const valueCandidates = points.filter(p => p.score >= valueMinScore && p.value !== null);
    const maximumValue = valueCandidates.reduce((best, p) => p.value !== null && (best === null || p.value > best) ? p.value : best, null);
    const bestValue = valueCandidates.filter(p => p.value !== null && maximumValue !== null && Math.abs(p.value - maximumValue) <= Math.max(Number.MIN_VALUE, Math.abs(maximumValue)) * 1e-10).sort((a, b) => stable(a.model, b.model));
    // A model is on the Pareto frontier if no other has <= cost and >= score,
    // with at least one strict improvement. Equal coordinates keep all models.
    let bestScore = -Infinity;
    const frontier = [];
    for (let i = 0; i < points.length;) {
        let end = i + 1;
        while (end < points.length && points[end].cost === points[i].cost)
            end++;
        const group = points.slice(i, end), localMax = group[0].score;
        if (localMax > bestScore)
            frontier.push(...group.filter(p => p.score === localMax));
        bestScore = Math.max(bestScore, localMax);
        i = end;
    }
    return { basis, points, strongest, bestValue, frontier, excluded: models.length - points.length, free: points.filter(p => p.cost === 0).length };
}
// log1p preserves true zero and spreads very small positive prices. The pivot
// changes spacing only: labels, rankings and displayed prices use raw values.
function priceTransform(cost, scale, pivot) {
    return scale === 'linear' ? cost : Math.log1p(cost / pivot);
}
function priceInverse(value, scale, pivot) {
    return scale === 'linear' ? value : Math.expm1(value) * pivot;
}
const chartLayout = { width: 960, height: 470, left: 62, right: 30, top: 70, bottom: 55 };
function groupChartPoints(points, xPosition, yPosition, cell = 26) {
    const bins = new Map();
    for (const point of points) {
        const x = xPosition(point.cost), y = yPosition(point.score);
        const id = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
        const existing = bins.get(id);
        if (existing) {
            const n = existing.points.length;
            existing.x = (existing.x * n + x) / (n + 1);
            existing.y = (existing.y * n + y) / (n + 1);
            existing.points.push(point);
        }
        else
            bins.set(id, { id, x, y, points: [point] });
    }
    const groups = [...bins.values()].sort((a, b) => a.id.localeCompare(b.id));
    // Adjacent grid cells can still have overlapping bubbles. Merge the nearest
    // pair until their centers have room for the largest highlighted markers.
    // Keep the weighted centroid and original members; zoom recomputes grouping.
    const separation = cell + 16;
    for (;;) {
        let nearest = separation * separation, pair = null;
        for (let i = 0; i < groups.length; i++)
            for (let j = i + 1; j < groups.length; j++) {
                const distance = (groups[i].x - groups[j].x) ** 2 + (groups[i].y - groups[j].y) ** 2;
                if (distance < nearest) {
                    nearest = distance;
                    pair = [i, j];
                }
            }
        if (!pair)
            break;
        const [i, j] = pair, a = groups[i], b = groups[j], count = a.points.length + b.points.length;
        a.x = (a.x * a.points.length + b.x * b.points.length) / count;
        a.y = (a.y * a.points.length + b.y * b.points.length) / count;
        a.points.push(...b.points);
        groups.splice(j, 1);
    }
    return groups;
}

return {DEFAULT_VALUE_MIN_SCORE,chartCost,chartAnalysis};})();
export const {DEFAULT_VALUE_MIN_SCORE,chartCost,chartAnalysis}=__chart;
const __cost=(()=>{
function decimal(value) {
    const match = value.match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
    if (!match || value.length > 1000)
        throw new Error('价格格式无效');
    let scale = (match[2]?.length ?? 0) - Number(match[3] ?? 0);
    let n = BigInt(match[1] + (match[2] ?? ''));
    if (Math.abs(scale) > 1000)
        throw new Error('价格精度超限');
    if (scale < 0) {
        n *= 10n ** BigInt(-scale);
        scale = 0;
    }
    return { n, scale };
}
// Decimal strings remain decimal throughout calculation; round only the displayed USD result.
function estimateCost(price, input, output, runs, cachePercent = 0, writePercent = 0) {
    if (price.currency !== 'USD' || price.unit !== 'million_tokens')
        throw new Error('不支持的币种或价格单位');
    if ([input, output, runs].some(n => !Number.isSafeInteger(n) || n < 0 || n > 1e9))
        throw new Error('Token 数与运行次数必须是 0–10 亿的整数');
    if ([cachePercent, writePercent].some(v => !Number.isInteger(v) || v < 0 || v > 100) || cachePercent + writePercent > 100)
        throw new Error('缓存比例必须是整数，命中与写入比例之和不能超过 100%');
    if (price.input_price === null || price.output_price === null)
        return null;
    if (cachePercent > 0 && price.cache_hit_price === null)
        throw new Error('缺少缓存命中价，无法应用缓存比例');
    if (writePercent > 0 && price.cache_write_price === null)
        throw new Error('缺少缓存写入价，无法应用写入比例');
    const values = [decimal(price.input_price), decimal(price.output_price), decimal(price.cache_hit_price ?? '0'), decimal(price.cache_write_price ?? '0')];
    const scale = Math.max(...values.map(v => v.scale));
    const [i, o, c, w] = values.map(v => v.n * 10n ** BigInt(scale - v.scale));
    const numerator = BigInt(runs) * (BigInt(input) * (i * BigInt(100 - cachePercent - writePercent) + c * BigInt(cachePercent) + w * BigInt(writePercent)) + BigInt(output) * o * 100n);
    const denominator = 10n ** BigInt(scale) * 100n * 1000000n;
    const rounded = (numerator * 100000000n + denominator / 2n) / denominator;
    return (rounded / 100000000n).toString() + '.' + (rounded % 100000000n).toString().padStart(8, '0');
}

return {estimateCost};})();
export const {estimateCost}=__cost;
const __ranking=(()=>{const {indexVersion}=__comparison;const {estimateCost}=__cost;

/** Remove only known inference settings; keep dates, sizes, Preview, Vision and base variants. */
function rankingModelName(name) {
    return name.replace(/\(([^()]*)\)/g, (_, contents) => {
        const remaining = contents.split(',').map(v => v.trim()).filter(v => !/^(?:non[- ]reasoning|reasoning|minimal|low|medium|high|xhigh|extra[- ]high|max|.+ fallback)$/i.test(v));
        return remaining.length ? '(' + remaining.join(', ') + ')' : '';
    }).replace(/\s+/g, ' ').trim();
}
/** Shared with the static renderer: raw scores, one reported version, no inferred fields. */
function modelRanking(models, metric = 'intelligence', requestedVersion = '', limit = 6) {
    if (!['intelligence', 'coding', 'agentic'].includes(metric) || ![6, 10].includes(limit))
        throw Error('排行榜参数无效');
    const versions = [...new Set(models.map(m => indexVersion(m.benchmarkVersion)).filter((v) => v !== null))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const version = requestedVersion || versions.at(-1) || null;
    const group = models.filter(m => version !== null && indexVersion(m.benchmarkVersion) === version);
    const eligible = group.filter(m => typeof m[metric] === 'number' && Number.isFinite(m[metric]) && m[metric] >= 0)
        .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    const seen = new Set(), families = new Set();
    const unique = eligible.filter(m => { const family = m.creator.trim().toLowerCase() + '\0' + rankingModelName(m.name).toLowerCase(); if (seen.has(m.id) || families.has(family))
        return false; seen.add(m.id); families.add(family); return true; });
    let rank = 0, prior;
    const rows = unique.slice(0, limit).map((model, index) => { const score = model[metric]; if (prior !== score)
        rank = index + 1; prior = score; return { model, score, rank, label: rankingModelName(model.name) }; });
    const highest = rows[0]?.score ?? 0, rounded = Math.ceil(highest / 10) * 10;
    const maximum = Math.max(10, Number.isFinite(rounded) ? rounded : highest);
    return { rows, version, versions, maximum, eligible: unique.length, missing: group.length - eligible.length, unknown: models.filter(m => !indexVersion(m.benchmarkVersion)).length };
}
/** Calendar-year window in the application's default timezone; never infer release from fetch time. */
function recentRankingModels(models, now = new Date()) {
    if (!Number.isFinite(now.getTime()))
        throw Error('无效参考日期');
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (key) => Number(parts.find(p => p.type === key).value), year = get('year'), month = get('month'), day = get('day');
    const iso = (y, m, d) => `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    const today = iso(year, month, day), cutoff = iso(year - 1, month, Math.min(day, new Date(Date.UTC(year - 1, month, 0)).getUTCDate()));
    let unknown = 0, older = 0, future = 0;
    const recent = models.filter(m => {
        const date = m.releaseDate;
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
            unknown++;
            return false;
        }
        if (date > today) {
            future++;
            return false;
        }
        if (date < cutoff) {
            older++;
            return false;
        }
        return true;
    });
    return { models: recent, today, cutoff, unknown, older, future };
}
/** Independent cache-wide leaderboards: each metric selects its own best configuration. */
function rankingPanels(models, metric = 'intelligence', version = '', limit = 6, now = new Date()) {
    const window = recentRankingModels(models, now), recent = window.models, minimum = 25;
    const qualified = recent.filter(m => typeof m.intelligence === 'number' && Number.isFinite(m.intelligence) && m.intelligence >= minimum);
    const below = recent.filter(m => typeof m.intelligence === 'number' && Number.isFinite(m.intelligence) && m.intelligence >= 0 && m.intelligence < minimum).length;
    const capability = { minimum, eligible: qualified.length, below, unknown: recent.length - qualified.length - below };
    const ability = modelRanking(qualified, metric, version, limit);
    const rank = (rows, ascending = false) => {
        rows.sort((a, b) => (ascending ? a.score - b.score : b.score - a.score) || a.model.name.localeCompare(b.model.name) || a.model.id.localeCompare(b.model.id));
        const ids = new Set(), families = new Set();
        const unique = rows.filter(({ model }) => { const key = model.creator.trim().toLowerCase() + '\0' + rankingModelName(model.name).toLowerCase(); if (ids.has(model.id) || families.has(key))
            return false; ids.add(model.id); families.add(key); return true; });
        let prior, position = 0;
        const selected = unique.slice(0, limit).map((row, i) => { if (prior !== row.score)
            position = i + 1; prior = row.score; return { ...row, rank: position, label: rankingModelName(row.model.name) }; });
        return { rows: selected, eligible: unique.length };
    };
    const speed = rank(qualified.filter(m => typeof m.speed === 'number' && Number.isFinite(m.speed) && m.speed >= 0).map(model => ({ model, score: model.speed })));
    const cost = rank(qualified.flatMap(model => {
        if ([model.inputPrice, model.outputPrice].some(p => typeof p !== 'number' || !Number.isFinite(p) || p < 0))
            return [];
        const value = estimateCost({ input_price: String(model.inputPrice), output_price: String(model.outputPrice), cache_hit_price: null, cache_write_price: null, currency: 'USD', unit: 'million_tokens' }, 10000, 2000, 1);
        return value === null ? [] : [{ model, score: Number(value) }];
    }), true);
    const maximum = (rows) => { const top = Math.max(...rows.map(r => r.score), 0), padded = top * 1.12; return top ? (Number.isFinite(padded) ? padded : top) : 1; };
    return { window: { today: window.today, cutoff: window.cutoff, unknown: window.unknown, older: window.older, future: window.future, total: recent.length }, capability, ability, speed: { ...speed, maximum: maximum(speed.rows) }, cost: { ...cost, maximum: maximum(cost.rows) } };
}

return {modelRanking,rankingPanels,recentRankingModels};})();
export const {modelRanking,rankingPanels,recentRankingModels}=__ranking;