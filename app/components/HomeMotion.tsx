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
        y: 28,
        opacity: 0,
        duration: 0.9,
        stagger: 0.12,
        ease: "power3.out",
        clearProps: "all",
      });

      gsap.utils.toArray<HTMLElement>("[data-scroll-reveal]").forEach((section) => {
        gsap.from(section, {
          y: 30,
          opacity: 0,
          duration: 0.75,
          ease: "power2.out",
          clearProps: "all",
          scrollTrigger: {
            trigger: section,
            start: "top 88%",
            once: true,
          },
        });
      });
    }, element);

    return () => context.revert();
  }, []);

  return <div ref={root}>{children}</div>;
}
