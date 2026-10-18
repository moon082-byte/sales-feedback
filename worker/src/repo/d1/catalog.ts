import type { Question, QuestionCategory, Tool } from '../../domain';
import type { CatalogRepo, DeleteResult } from '../types';

interface ToolRow {
  id: number;
  name: string;
  is_active: number;
  sort_order: number;
}

interface QuestionRow {
  id: number;
  category: QuestionCategory;
  text: string;
  is_active: number;
  sort_order: number;
}

const mapTool = (t: ToolRow): Tool => ({ id: t.id, name: t.name, isActive: t.is_active === 1, sortOrder: t.sort_order });
const mapQuestion = (q: QuestionRow): Question => ({
  id: q.id,
  category: q.category,
  text: q.text,
  isActive: q.is_active === 1,
  sortOrder: q.sort_order,
});

const TOOL_COLS = 'id, name, is_active, sort_order';
const QUESTION_COLS = 'id, category, text, is_active, sort_order';

/** 사용 중이면 비활성화, 아니면 삭제 */
async function softDelete(db: D1Database, table: 'tools' | 'questions', id: number, usedSql: string): Promise<DeleteResult> {
  const exists = await db.prepare(`SELECT 1 AS x FROM ${table} WHERE id = ?`).bind(id).first();
  if (!exists) return 'not_found';
  const used = await db.prepare(usedSql).bind(id).first();
  if (used) {
    await db.prepare(`UPDATE ${table} SET is_active = 0 WHERE id = ?`).bind(id).run();
    return 'deactivated';
  }
  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  return 'deleted';
}

function updateSets(patch: Record<string, unknown>, columns: Record<string, string>) {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of Object.entries(columns)) {
    const v = patch[key];
    if (v === undefined) continue;
    sets.push(`${col} = ?`);
    params.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  return { sets, params };
}

export function createCatalogRepo(db: D1Database): CatalogRepo {
  const reorder = async (table: 'tools' | 'questions', ids: number[]) => {
    if (!ids.length) return;
    await db.batch(ids.map((id, i) => db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`).bind(i + 1, id)));
  };

  return {
    async listTools(activeOnly) {
      const { results } = await db
        .prepare(`SELECT ${TOOL_COLS} FROM tools ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY sort_order, id`)
        .all<ToolRow>();
      return results.map(mapTool);
    },

    async listQuestions(activeOnly) {
      const { results } = await db
        .prepare(`SELECT ${QUESTION_COLS} FROM questions ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY category, sort_order, id`)
        .all<QuestionRow>();
      return results.map(mapQuestion);
    },

    async createTool(name, now) {
      const r = await db
        .prepare(
          `INSERT INTO tools (name, sort_order, created_at)
           VALUES (?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM tools), ?) RETURNING ${TOOL_COLS}`,
        )
        .bind(name, now)
        .first<ToolRow>();
      return mapTool(r!);
    },

    async updateTool(id, patch) {
      const { sets, params } = updateSets(patch, { name: 'name', isActive: 'is_active' });
      if (sets.length) await db.prepare(`UPDATE tools SET ${sets.join(', ')} WHERE id = ?`).bind(...params, id).run();
      const r = await db.prepare(`SELECT ${TOOL_COLS} FROM tools WHERE id = ?`).bind(id).first<ToolRow>();
      return r ? mapTool(r) : null;
    },

    deleteTool: (id) => softDelete(db, 'tools', id, 'SELECT 1 AS x FROM records WHERE tool_id = ? LIMIT 1'),
    reorderTools: (ids) => reorder('tools', ids),

    async createQuestion(category, text, now) {
      const r = await db
        .prepare(
          `INSERT INTO questions (category, text, sort_order, created_at)
           VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM questions WHERE category = ?), ?)
           RETURNING ${QUESTION_COLS}`,
        )
        .bind(category, text, category, now)
        .first<QuestionRow>();
      return mapQuestion(r!);
    },

    async updateQuestion(id, patch) {
      const { sets, params } = updateSets(patch, { text: 'text', isActive: 'is_active' });
      if (sets.length) await db.prepare(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`).bind(...params, id).run();
      const r = await db.prepare(`SELECT ${QUESTION_COLS} FROM questions WHERE id = ?`).bind(id).first<QuestionRow>();
      return r ? mapQuestion(r) : null;
    },

    deleteQuestion: (id) => softDelete(db, 'questions', id, 'SELECT 1 AS x FROM record_answers WHERE question_id = ? LIMIT 1'),
    reorderQuestions: (ids) => reorder('questions', ids),
  };
}
