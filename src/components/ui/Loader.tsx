import styled from "styled-components";

const SLIDER_COUNT = 5;

const Wrapper = styled.div<{ $compact?: boolean }>`
  .loader {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: row;
  }

  .slider {
    overflow: hidden;
    background-color: #eef2ff;
    margin: 0 ${(p) => (p.$compact ? "5px" : "8px")};
    height: ${(p) => (p.$compact ? "28px" : "56px")};
    width: ${(p) => (p.$compact ? "8px" : "14px")};
    border-radius: 30px;
    box-shadow:
      6px 6px 10px rgba(15, 23, 42, 0.08),
      -6px -6px 16px #fff,
      inset -3px -3px 6px rgba(37, 99, 235, 0.12),
      inset 3px 3px 6px rgba(15, 23, 42, 0.06);
    position: relative;
  }

  .slider::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    height: ${(p) => (p.$compact ? "8px" : "14px")};
    width: ${(p) => (p.$compact ? "8px" : "14px")};
    border-radius: 100%;
    box-shadow:
      inset 0px 0px 0px rgba(0, 0, 0, 0.3),
      0px 420px 0 400px #4f46e5,
      inset 0px 0px 0px rgba(0, 0, 0, 0.1);
    animation: liquidFill 2.2s ease-in-out infinite;
    animation-delay: calc(-0.4s * var(--i));
  }

  @keyframes liquidFill {
    0% {
      transform: translateY(180px);
      filter: hue-rotate(0deg);
    }
    50% {
      transform: translateY(0);
    }
    100% {
      transform: translateY(180px);
      filter: hue-rotate(80deg);
    }
  }
`;

export function LiquidLoader({ compact = false }: { compact?: boolean }) {
  return (
    <Wrapper $compact={compact}>
      <section className="loader">
        {Array.from({ length: SLIDER_COUNT }).map((_, i) => (
          <div key={i} className="slider" style={{ "--i": i } as React.CSSProperties} />
        ))}
      </section>
    </Wrapper>
  );
}

export function Loader({ label = "Loading…", full = false }: { label?: string; full?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${full ? "h-[60vh]" : "py-10"}`}>
      <LiquidLoader compact={!full} />
      <span className="text-sm font-medium text-ink-500">{label}</span>
    </div>
  );
}
