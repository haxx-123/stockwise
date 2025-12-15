import React, { useState, useEffect } from 'react';
import { Icons } from './Icons';
import { dataService } from '../services/dataService';
import { authService } from '../services/authService';
import { Announcement } from '../types';

export const GlobalAnnouncement = () => {
    const [currentAnn, setCurrentAnn] = useState<Announcement | null>(null);
    const user = authService.getCurrentUser();

    useEffect(() => {
        if (!user) return;
        checkForAnnouncements();
    }, [user?.id]);

    const checkForAnnouncements = async () => {
        if (!user) return;
        const list = await dataService.getAnnouncements();
        const now = new Date();

        // Logic: Find first Active, Not Force Deleted, Popup Enabled, Not Read by User announcement
        const target = list.find(a => {
            if (a.is_force_deleted) return false;
            if (new Date(a.valid_until) < now) return false;
            if (!a.popup_config?.enabled) return false; // Only popup if enabled
            if (a.read_by?.includes(user.id)) return false;
            return true;
        });

        if (target) {
            setCurrentAnn(target);
        }
    };

    const handleClose = async () => {
        if (currentAnn && user) {
            await dataService.markAnnouncementRead(currentAnn.id, user.id);
            setCurrentAnn(null);
            // Check for next one immediately
            checkForAnnouncements(); 
        }
    };

    if (!currentAnn) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-scale-in border dark:border-gray-700 relative">
                {/* Decorative Header */}
                <div className="h-24 bg-gradient-to-r from-blue-600 to-purple-600 relative overflow-hidden flex items-center justify-center">
                    <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                    <Icons.Sparkles size={48} className="text-white drop-shadow-lg" />
                    <h2 className="text-2xl font-bold text-white ml-3 drop-shadow-md">最新公告</h2>
                </div>

                <div className="p-6 md:p-8">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 text-center">{currentAnn.title}</h3>
                    <p className="text-xs text-gray-400 text-center mb-6">
                        发布时间: {new Date(currentAnn.created_at).toLocaleDateString()}
                    </p>

                    <div 
                        className="prose dark:prose-invert max-w-none text-sm text-gray-600 dark:text-gray-300 max-h-60 overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border dark:border-gray-700"
                        dangerouslySetInnerHTML={{ __html: currentAnn.content }}
                    />

                    <div className="mt-8">
                        <button 
                            onClick={handleClose}
                            className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold py-3 rounded-xl hover:opacity-90 transition-opacity"
                        >
                            我已阅读
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};