import React from 'react';

interface Props {
  data?: any;
  className?: string;
}

const TriangleHeatmap: React.FC<Props> = ({ data, className }) => {
  return (
    <div className={className || ''}>
      {/* Stub de heatmap (à remplacer par un vrai chart plus tard) */}
      <div className="w-full h-64 grid place-items-center border border-dashed border-gray-300 rounded">
        <span className="text-sm text-gray-500">TriangleHeatmap (stub)</span>
      </div>
    </div>
  );
};

export default TriangleHeatmap;
