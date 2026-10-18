'use client';
import Image from 'next/image';
import { useState } from 'react';

export function PreviewImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="preview-unavailable" role="img" aria-label="외부 미리보기를 불러오지 못했습니다"><span aria-hidden="true">▧</span><small>미리보기 연결 지연<br />자료의 출처를 확인하세요</small></span>;
  return <Image src={src} alt="" width={600} height={360} unoptimized referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
