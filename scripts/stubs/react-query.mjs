// Just enough React Query for hooks called outside a component. The query
// client serves on-hand reads from globalThis.__onHandData (by week start)
// and records which weeks were asked for in globalThis.__queryReads;
// globalThis.__queryData(queryKey) answers other reads (the meal plans, in
// scripts/check-voice.mjs) when it returns something.
globalThis.__queryReads = []
globalThis.__onHandData = {}
globalThis.__queryData = null
const client = {
  invalidateQueries: async () => {},
  getQueryData: () => undefined,
  fetchQuery: async (query) => {
    globalThis.__queryReads.push(query.queryKey)
    const other = globalThis.__queryData?.(query.queryKey)
    if (other !== undefined) return other
    const week = query.queryKey[2]
    return globalThis.__onHandData[week] ?? { lists: [], plans: [], adjustments: [] }
  },
}
export const useQueryClient = () => client
export const useQuery = () => ({ data: undefined })
export const useMutation = () => ({ mutate: () => {}, mutateAsync: async () => {}, isPending: false })
