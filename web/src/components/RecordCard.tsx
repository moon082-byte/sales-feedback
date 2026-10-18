import { Link } from 'react-router-dom';
import type { RecordSummary } from '../api/client';
import { displayName, formatDateTime } from '../lib/format';

/** 받은 평가는 작성자를, 내가 쓴 기록은 함께한 동료를 제목으로 표시 */
export function RecordCard({ record, perspective }: { record: RecordSummary; perspective: 'received' | 'written' | 'admin' }) {
  const title =
    perspective === 'admin'
      ? `${displayName(record.author)}${record.peers.length ? ` · 동료 ${record.peers.length}명` : ''}`
      : perspective === 'received'
      ? `${displayName(record.author)}님의 평가`
      : record.peers.length
        ? `${record.peers.map(displayName).join(', ')}와 함께`
        : '혼자 진행한 영업';

  return (
    <Link to={`/records/${record.id}`} className="record-card">
      <div className="record-card-top">
        <span className="record-card-title">{title}</span>
        <span className="row-desc">{formatDateTime(record.createdAt)}</span>
      </div>
      <div className="badges">
        {record.tool && <span className="badge">{record.tool.name}</span>}
        <span className={`badge${record.phoneExchanged ? ' positive' : ''}`}>번호교환 {record.phoneExchanged ? 'O' : 'X'}</span>
        {record.q1Count > 0 && <span className="badge warn">파악 못함 {record.q1Count}</span>}
        {record.q2Count > 0 && <span className="badge warn">멘트·비언어 {record.q2Count}</span>}
      </div>
      {record.customerInfo && <p className="record-card-text">{record.customerInfo}</p>}
    </Link>
  );
}
