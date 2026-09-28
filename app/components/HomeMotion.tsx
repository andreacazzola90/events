"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function HomeMotion({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const context = gsap.context(() => {
      gsap.from("[data-hero-reveal]", {
        y: 36,
        duration: 0.95,
        stagger: 0.11,
        ease: "power3.out",
        clearProps: "all",
      });

      gsap.utils.toArray<HTMLElement>("[data-scroll-reveal]").forEach((section) => {
        gsap.from(section, {
          y: 42,
          duration: 0.85,
          ease: "power3.out",
          clearProps: "all",
          scrollTrigger: {
            trigger: section,
            start: "top 90%",
            once: true,
          },
        });
      });
    }, element);

    return () => context.revert();
  }, []);

  return <div ref={root}>{children}</div>;
}
