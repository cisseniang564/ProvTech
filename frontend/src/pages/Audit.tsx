import React from 'react';
import Layout from '@/components/common/Layout';

const Audit: React.FC = () => {
  return (
    <Layout>
      <div className="p-6">
        <h1 className="text-2xl font-bold">Audit</h1>
        <p className="text-gray-600 mt-2">Journal d’audit à venir…</p>
      </div>
    </Layout>
  );
};

export default Audit;
