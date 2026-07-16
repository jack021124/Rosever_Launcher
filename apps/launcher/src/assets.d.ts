/** 图片资源导入（vite 构建时转为 URL）。
 *  独立的非模块 .d.ts，使 declare module 是全局 ambient 声明，TS 才能匹配带别名的路径。 */
declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
