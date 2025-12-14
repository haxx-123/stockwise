
import { Product } from '../types';

/**
 * matchesProduct
 * Checks if a product matches the query string.
 */
export const matchProduct = (product: Product, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase().trim();
    if (product.name.toLowerCase().includes(q)) return true;
    if (product.sku && product.sku.toLowerCase().includes(q)) return true;
    if (product.pinyin && product.pinyin.toLowerCase().includes(q)) return true;
    return false;
};

export const getUniqueCategories = (products: Product[]): string[] => {
    const cats = new Set<string>();
    products.forEach(p => {
        if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
};

/**
 * Calculates similarity between two strings (0 to 1)
 * Using Levenshtein distance
 */
export const calculateSimilarity = (s1: string, s2: string): number => {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;
    if (longerLength === 0) {
        return 1.0;
    }
    const editDistance = levenshteinDistance(longer, shorter);
    return (longerLength - editDistance) / parseFloat(String(longerLength));
};

function levenshteinDistance(s1: string, s2: string) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs = new Array();
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i == 0) costs[j] = j;
            else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) != s2.charAt(j - 1)) newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}
