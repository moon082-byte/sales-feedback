-- 로컬 개발용 예시 데이터 (운영 DB에는 실행하지 않음. 실제 목록은 관리자 화면에서 관리)
INSERT INTO tools (name, sort_order, created_at) VALUES
  ('기본 브로슈어', 1, 0),
  ('체험 키트', 2, 0);

INSERT INTO questions (category, text, sort_order, created_at) VALUES
  ('Q1', '고객의 예산', 1, 0),
  ('Q1', '의사결정권자', 2, 0),
  ('Q1', '도입 시기', 3, 0),
  ('Q2', '첫 인사 멘트', 1, 0),
  ('Q2', '시선 처리', 2, 0),
  ('Q2', '말 속도와 톤', 3, 0);
