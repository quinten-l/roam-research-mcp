import { Graph, q } from '@roam-research/roam-api-sdk';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { RoamBlock } from '../../types/roam.js';
import { resolveBlockRefs } from '../helpers/refs.js';
import { fetchChildrenByDepth } from '../helpers/fetch-children.js';

export class BlockRetrievalOperations {
  constructor(private graph: Graph) { }

  async fetchBlockWithChildren(block_uid_raw: string, depth: number = 4): Promise<RoamBlock | null> {
    if (!block_uid_raw) {
      throw new McpError(ErrorCode.InvalidRequest, 'block_uid is required.');
    }

    const block_uid = block_uid_raw.replace(/^\(\((.*)\)\)$/, '$1');

    try {
      const rootBlockQuery = `[:find ?string ?order ?heading
                               :in $ ?blockUid
                               :where [?b :block/uid ?blockUid]
                                      [?b :block/string ?string]
                                      [?b :block/order ?order]
                                      [(get-else $ ?b :block/heading 0) ?heading]]`;
      const rootBlockResults = await q(this.graph, rootBlockQuery, [block_uid]) as [string, number, number | null][];

      if (!rootBlockResults || rootBlockResults.length === 0) {
        return null;
      }

      const [rootString, rootOrder, rootHeading] = rootBlockResults[0];
      const childrenMap = await fetchChildrenByDepth(this.graph, [block_uid], depth);

      const rootBlock: RoamBlock = {
        uid: block_uid,
        string: rootString,
        order: rootOrder,
        heading: rootHeading || undefined,
        children: childrenMap[block_uid] || [],
      };

      // Gather all blocks in the tree to scan for references
      const allBlocks: RoamBlock[] = [];
      const traverse = (b: RoamBlock) => {
        allBlocks.push(b);
        b.children.forEach(traverse);
      };
      traverse(rootBlock);

      // Resolve references (max depth 2)
      await resolveBlockRefs(this.graph, allBlocks, 2);

      return rootBlock;
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch block with children: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
