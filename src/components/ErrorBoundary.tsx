import { Component, type ReactNode } from 'react';

/** One broken screen should never blank the whole app: show what went wrong and a reload button instead. */
export default class ErrorBoundary extends Component<{ label: string; children: ReactNode }, { err?: Error }> {
  state: { err?: Error } = {};
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error(this.props.label, err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="center">
        <p>The {this.props.label} hit a problem.</p>
        <p className="muted"><code>{String(this.state.err.message)}</code></p>
        <button onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
