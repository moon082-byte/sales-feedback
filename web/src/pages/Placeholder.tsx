import { TopBar } from '../components/ui';

/** 이후 단계에서 구현될 화면의 임시 페이지 */
export default function Placeholder({ title, message }: { title: string; message: string }) {
  return (
    <div className="app">
      <TopBar title={title} />
      <section className="card">
        <div className="empty">{message}</div>
      </section>
    </div>
  );
}
