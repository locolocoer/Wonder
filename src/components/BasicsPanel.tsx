import React from 'react';
import { BASICS } from '../lib/basics';
import { Markdown } from './Markdown';

// 独立的基础知识栏目：编译原理零基础教程
export function BasicsPanel() {
  return (
    <div className="basics-panel">
      <div className="basics-intro">
        面向零基础的编译原理入门。按顺序往下读即可，配合左侧「课程路线」分阶段实践。
      </div>
      {BASICS.map((s) => (
        <div key={s.id} className="basics-section">
          <div className="basics-section-title">{s.title}</div>
          <div className="basics-section-body">
            <Markdown text={s.content} />
          </div>
        </div>
      ))}
    </div>
  );
}
