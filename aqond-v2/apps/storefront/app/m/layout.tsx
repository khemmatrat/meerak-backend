'use client';



import { Suspense } from 'react';

import './marketplace-axs.css';

import { MobileBodyClass } from '@/components/mobile/MobileBodyClass';

import { MobileEmbedMode } from '@/components/mobile/MobileEmbedMode';

import { MobileTabNav } from '@/components/mobile/MobileTabNav';

import { JarvisWhenNotEmbed } from '@/components/mobile/JarvisWhenNotEmbed';

import { JarvisFeedProvider } from '@/lib/jarvis/feedContext';

import { StorefrontGrowthBoot } from '@/components/growth/StorefrontGrowthBoot';



export default function MobileLayout({ children }: { children: React.ReactNode }) {

  return (

    <JarvisFeedProvider>

      <StorefrontGrowthBoot />

      <MobileBodyClass />

      <Suspense fallback={null}>

        <MobileEmbedMode />

      </Suspense>

      <div className="tt-shell axs-marketplace">

        {children}

        <Suspense fallback={null}>

          <JarvisWhenNotEmbed />

        </Suspense>

        <Suspense fallback={null}>

          <MobileTabNav />

        </Suspense>

      </div>

    </JarvisFeedProvider>

  );

}

