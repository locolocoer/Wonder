import React from 'react';
import { BASICS_BY_COURSE, BASICS } from '../lib/basics';
import { Markdown } from './Markdown';

const INTRO_BY_COURSE: Record<string, string> = {
  compiler: '面向零基础的编译原理入门。按顺序往下读即可，配合左侧「课程路线」分阶段实践。',
  os: '面向零基础的操作系统入门。按顺序往下读即可，配合左侧「课程路线」分阶段实践。',
  httpd: '面向零基础的 HTTP 服务器入门。按顺序往下读即可，配合左侧「课程路线」分阶段实践。',
};

// 基础栏目：随当前课程切换内容
export function BasicsPanel({ courseId }: { courseId: string }) {
  const sections = BASICS_BY_COURSE[courseId] || BASICS;
  const intro = INTRO_BY_COURSE[courseId] || INTRO_BY_COURSE.compiler;
  return (
    <div className="basics-panel">
      <div className="basics-intro">{intro}</div>
      {sections.map((s) => (
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
