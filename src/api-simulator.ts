export interface Item {
    id: string;
    text: string;
}

export interface Page {
    page: number;
    items: Item[];
    nextPage: number | null;
    prevPage: number | null;
}

const PAGE_SIZE = 10;
const TOTAL_ITEMS = 1000;
const LATENCY = 300; // ms

export class ApiSimulator {
    async getPage(pageNumber: number): Promise<Page> {
        return new Promise((resolve) => {
            setTimeout(() => {
                const start = (pageNumber - 1) * PAGE_SIZE;
                const end = start + PAGE_SIZE;

                // Generate items
                const items: Item[] = [];
                for (let i = start; i < end; i++) {
                    if (i >= TOTAL_ITEMS) break;
                    // Support negative indices or circular? No, let's keep it 1-based, finite
                    if (i < 0) continue;
                    items.push({
                        id: `item-${i + 1}`,
                        text: `Item ${i + 1} (Page ${pageNumber})`
                    });
                }

                resolve({
                    page: pageNumber,
                    items,
                    nextPage: end < TOTAL_ITEMS ? pageNumber + 1 : null,
                    prevPage: pageNumber > 1 ? pageNumber - 1 : null
                });
            }, LATENCY);
        });
    }
}
