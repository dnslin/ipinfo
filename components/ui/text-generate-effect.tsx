"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

export const TextGenerateEffect = ({
  words,
  className,
  filter = true,
  duration = 0.5,
}: {
  words: string;
  className?: string;
  filter?: boolean;
  duration?: number;
}) => {
  const reducedMotion = useReducedMotion();
  const wordsArray = words.split(" ");

  return (
    <div className={cn("font-bold leading-snug", className)}>
      {wordsArray.map((word, index) => (
        <Fragment key={`${words}-${index}`}>
          {index > 0 ? " " : null}
          <motion.span
            initial={reducedMotion ? false : { opacity: 0, filter: filter ? "blur(10px)" : "none" }}
            animate={{ opacity: 1, filter: "none" }}
            transition={{ duration: reducedMotion ? 0 : duration, delay: reducedMotion ? 0 : index * 0.2 }}
          >
            {(word.match(/[^:]*:+|[^:]+$/g) || [word]).map((part, partIndex, parts) => (
              <Fragment key={partIndex}>
                <span className="inline-block">{part}</span>
                {partIndex < parts.length - 1 ? <wbr /> : null}
              </Fragment>
            ))}
          </motion.span>
        </Fragment>
      ))}
    </div>
  );
};
