"use client"

import { motion } from "framer-motion"
import { staggerContainer, fadeInUp, smoothTransition } from "@/lib/animations"

interface AnimatedContainerProps {
  children: React.ReactNode
  className?: string
}

export function AnimatedContainer({ children, className }: AnimatedContainerProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  )
}

interface AnimatedItemProps {
  children: React.ReactNode
  className?: string
}

export function AnimatedItem({ children, className }: AnimatedItemProps) {
  return (
    <motion.div
      variants={fadeInUp}
      transition={smoothTransition}
      className={className}
    >
      {children}
    </motion.div>
  )
}
