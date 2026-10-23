// Just enough React Query for hooks called outside a component. The query
// client serves on-hand reads from globalThis.__onHandData (by week start)
// and records which weeks were asked for in globalThis.__queryReads.
globalThis.__queryReads = []
globalThis.__onHandData = {}
const client = {
  invalidateQueries: async () => {},
  getQueryData: () => undefined,
  fetchQuery: async (query) => {
    globalThis.__queryReads.push(query.queryKey)
    const week = query.queryKey[2]
    return globalThis.__onHandData[week] ?? { lists: [], plans: [], adjustments: [] }
  },
}
export const useQueryClient = () => client
export const useQuery = () => ({ data: undefined })
