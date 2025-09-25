import { useEffect } from 'react';

/**
 * Hook pour gérer le titre de la page (remplace react-helmet-async)
 */
export const usePageTitle = (title: string, suffix: string = 'ProvTech Actuarial SaaS') => {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | ${suffix}`;
    
    // Cleanup : restore previous title on unmount
    return () => {
      document.title = previousTitle;
    };
  }, [title, suffix]);
};

/**
 * Hook pour gérer les meta descriptions
 */
export const useMetaDescription = (description: string) => {
  useEffect(() => {
    let metaDescription = document.querySelector('meta[name="description"]') as HTMLMetaElement;
    
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      document.head.appendChild(metaDescription);
    }
    
    const previousContent = metaDescription.content;
    metaDescription.content = description;
    
    return () => {
      if (previousContent) {
        metaDescription.content = previousContent;
      }
    };
  }, [description]);
};

/**
 * Hook combiné pour titre + description
 */
export const usePageMeta = (title: string, description?: string) => {
  usePageTitle(title);
  
  if (description) {
    useMetaDescription(description);
  }
};