import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import Discovery from './pages/Discovery';
import Templates from './pages/Templates';
import Campaigns from './pages/Campaigns';
import ProspectDetail from './pages/ProspectDetail';
import AgentDashboard from './pages/AgentDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="discovery" element={<Discovery />} />
          <Route path="templates" element={<Templates />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="agents" element={<AgentDashboard />} />
          <Route path="prospect/:id" element={<ProspectDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

