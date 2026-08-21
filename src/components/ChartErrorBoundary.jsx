// InsightIQ — chart error boundary
//
// Isolated so it can be imported by both App.jsx and ChartsTab.jsx
// without creating a circular dependency.
import React from 'react';
import { AlertCircle } from 'lucide-react';

export class ChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e) { console.warn('Chart error:', e.message); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="chart-fallback">
          <AlertCircle size={20} />
          <p>Chart unavailable</p>
          <button
            className="btn btn-secondary"
            style={{ marginTop: 8, fontSize: 11, padding: '4px 12px' }}
            onClick={() => this.setState({ hasError: false })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
